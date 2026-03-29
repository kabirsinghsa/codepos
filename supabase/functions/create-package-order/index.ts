import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

async function md5(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  return encodeHex(new Uint8Array(hashBuffer))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const {
      site_id,
      package_type,
      duration_days,
      amount,
      vehicle_reg,
      vehicle_make,
      vehicle_colour,
      customer_email,
      customer_phone,
    } = await req.json()

    if (!vehicle_reg || !customer_email || !customer_phone) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: order, error } = await supabase
      .from('package_orders')
      .insert({
        site_id: site_id || null,
        package_type: package_type || 'ultimate_exterior',
        duration_days: duration_days || 30,
        amount: amount || 0,
        vehicle_reg: vehicle_reg.toUpperCase().trim(),
        vehicle_make: vehicle_make || '',
        vehicle_colour: vehicle_colour || '',
        customer_email: customer_email.trim(),
        customer_phone: customer_phone.trim(),
        payment_status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Insert error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if PayFast is enabled
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', [
        'payfast_enabled', 'payfast_merchant_id', 'payfast_merchant_key',
        'payfast_passphrase', 'payfast_sandbox'
      ])

    const settingsMap: Record<string, string> = {}
    settings?.forEach((s: any) => { settingsMap[s.key] = s.value })

    const payfastEnabled = settingsMap['payfast_enabled'] === 'true'
    const hasMerchantId = !!settingsMap['payfast_merchant_id']
    const hasMerchantKey = !!settingsMap['payfast_merchant_key']

    if (payfastEnabled && hasMerchantId && hasMerchantKey) {
      const sandbox = settingsMap['payfast_sandbox'] === 'true'
      const payfastUrl = sandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process'

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const appUrl = 'https://codepos.lovable.app'

      const pfData: Record<string, string> = {
        merchant_id: settingsMap['payfast_merchant_id'],
        merchant_key: settingsMap['payfast_merchant_key'],
        return_url: `${appUrl}/buy-package?payment=success&order_id=${order.id}`,
        cancel_url: `${appUrl}/buy-package?payment=cancelled`,
        notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
        email_address: order.customer_email,
        cell_number: order.customer_phone,
        m_payment_id: order.id,
        amount: Number(order.amount).toFixed(2),
        item_name: `Wash Package - ${(order.package_type || '').replace(/_/g, ' ')} (${order.duration_days} days)`,
        item_description: `Vehicle: ${order.vehicle_reg}`,
      }

      // Generate MD5 signature
      const passphrase = settingsMap['payfast_passphrase'] || ''
      const paramString = Object.entries(pfData)
        .filter(([_, v]) => v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
        .join('&')

      const signatureInput = passphrase
        ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
        : paramString

      const signature = await md5(signatureInput)
      pfData['signature'] = signature

      return new Response(
        JSON.stringify({
          success: true,
          order_id: order.id,
          payfast: true,
          payfast_url: payfastUrl,
          payfast_data: pfData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, order_id: order.id, payfast: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
