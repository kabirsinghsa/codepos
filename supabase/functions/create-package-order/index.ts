import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function generatePayFastForm(order: any, settings: Record<string, string>): string {
  const sandbox = settings['payfast_sandbox'] === 'true'
  const baseUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process'

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  const data: Record<string, string> = {
    merchant_id: settings['payfast_merchant_id'],
    merchant_key: settings['payfast_merchant_key'],
    return_url: `${settings['buy_package_url'] || supabaseUrl.replace('.supabase.co', '.lovable.app')}/buy-package?payment=success&order_id=${order.id}`,
    cancel_url: `${settings['buy_package_url'] || supabaseUrl.replace('.supabase.co', '.lovable.app')}/buy-package?payment=cancelled`,
    notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
    name_first: '',
    email_address: order.customer_email,
    cell_number: order.customer_phone,
    m_payment_id: order.id,
    amount: Number(order.amount).toFixed(2),
    item_name: `Wash Package - ${order.package_type.replace(/_/g, ' ')} (${order.duration_days} days)`,
    item_description: `Vehicle: ${order.vehicle_reg}`,
  }

  // Generate signature
  const passphrase = settings['payfast_passphrase'] || ''
  const paramString = Object.entries(data)
    .filter(([_, v]) => v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
    .join('&')

  const signatureString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : paramString

  // MD5 hash
  const encoder = new TextEncoder()
  const hashBuffer = new Uint8Array(16)
  // Use Web Crypto for MD5 is not available, so we'll use a simple approach
  // PayFast requires MD5 - we'll compute it
  const md5 = async (str: string): Promise<string> => {
    // Deno has crypto.subtle but no MD5, so use a manual approach
    const msgUint8 = new TextEncoder().encode(str)
    // MD5 via a simple implementation for Deno
    const { createHash } = await import("https://deno.land/std@0.224.0/crypto/crypto.ts")
    // Actually let's use the standard crypto module
    const hash = new (await import("https://deno.land/std@0.224.0/hash/md5.ts")).Md5()
    hash.update(str)
    return hash.toString()
  }

  return JSON.stringify({
    payfast_url: baseUrl,
    payfast_data: data,
    signature_string: signatureString,
  })
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

    // Create the order
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
      // Build PayFast redirect data
      const sandbox = settingsMap['payfast_sandbox'] === 'true'
      const payfastUrl = sandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process'

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      // We need the app's public URL for return/cancel - use the published URL from settings or construct it
      const appUrl = settingsMap['app_url'] || 'https://codepos.lovable.app'

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

      // MD5 hash using Deno std
      const { Md5 } = await import("https://deno.land/std@0.224.0/hash/md5.ts")
      const md5Hash = new Md5()
      md5Hash.update(signatureInput)
      const signature = md5Hash.toString()

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

    // PayFast not enabled - just return order as pending
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
