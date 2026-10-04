import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PayFast signs with PHP urlencode(): spaces as "+", and ! ' ( ) * ~ encoded too
const pfEncode = (v: string) =>
  encodeURIComponent(v.trim())
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+')

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
    const body = await req.text()
    const params = new URLSearchParams(body)
    const pfData: Record<string, string> = {}
    params.forEach((value, key) => { pfData[key] = value })

    console.log('PayFast ITN received:', JSON.stringify(pfData))

    const orderId = pfData['m_payment_id']
    const paymentStatus = pfData['payment_status']
    const pfPaymentId = pfData['pf_payment_id']
    const amountGross = pfData['amount_gross']

    if (!orderId) {
      console.error('No m_payment_id in ITN')
      return new Response('NO_ORDER_ID', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get PayFast settings for signature verification
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['payfast_merchant_id', 'payfast_passphrase', 'payfast_sandbox'])

    const settingsMap: Record<string, string> = {}
    settings?.forEach((s: any) => { settingsMap[s.key] = s.value })

    // Verify signature
    // Payment must be for OUR merchant account
    if (settingsMap['payfast_merchant_id'] && pfData['merchant_id'] && pfData['merchant_id'] !== settingsMap['payfast_merchant_id'].trim()) {
      console.error('Merchant ID mismatch')
      return new Response('MERCHANT_MISMATCH', { status: 400 })
    }

    const passphrase = (settingsMap['payfast_passphrase'] || '').trim()
    const receivedSignature = pfData['signature']

    const signatureParams = Object.entries(pfData)
      .filter(([k]) => k !== 'signature')
      .map(([k, v]) => `${k}=${pfEncode(v)}`)
      .join('&')

    const signatureInput = passphrase
      ? `${signatureParams}&passphrase=${pfEncode(passphrase)}`
      : signatureParams

    const calculatedSignature = await md5(signatureInput)

    if (calculatedSignature !== receivedSignature) {
      console.error('Signature mismatch:', { calculated: calculatedSignature, received: receivedSignature })
      return new Response('SIGNATURE_MISMATCH', { status: 400 })
    }

    // Verify with PayFast server
    const sandbox = settingsMap['payfast_sandbox'] === 'true'
    const pfHost = sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za'

    try {
      const verifyResponse = await fetch(`https://${pfHost}/eng/query/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      })
      const verifyResult = await verifyResponse.text()
      if (verifyResult !== 'VALID') {
        console.error('PayFast server validation failed:', verifyResult)
        return new Response('VALIDATION_FAILED', { status: 400 })
      }
    } catch (verifyErr) {
      console.error('PayFast validation request failed:', verifyErr)
      // Fail closed: PayFast retries the ITN, so a temporary error is safe
      return new Response('VALIDATION_UNAVAILABLE', { status: 503 })
    }

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('package_orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('Order not found:', orderId)
      return new Response('ORDER_NOT_FOUND', { status: 404 })
    }

    // Verify amount matches
    if (!amountGross || Math.abs(Number(amountGross) - Number(order.amount)) > 0.01) {
      console.error('Amount mismatch:', { expected: order.amount, received: amountGross })
      return new Response('AMOUNT_MISMATCH', { status: 400 })
    }

    if (paymentStatus === 'COMPLETE') {
      if (order.payment_status === 'activated') {
        return new Response('OK', { status: 200 })
      }

      const startDate = new Date()
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + (order.duration_days || 30))

      const { data: pkg, error: pkgError } = await supabase
        .from('wash_packages')
        .insert({
          vehicle_reg: order.vehicle_reg,
          vehicle_make: order.vehicle_make || '',
          vehicle_colour: order.vehicle_colour || '',
          customer_phone: order.customer_phone || '',
          wash_type: order.package_type || 'ultimate_exterior',
          price: order.amount || 0,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          site_id: order.site_id || null,
          active: true,
        })
        .select()
        .single()

      if (pkgError) {
        console.error('Package creation error:', pkgError)
        return new Response('PACKAGE_CREATE_FAILED', { status: 500 })
      }

      await supabase
        .from('package_orders')
        .update({
          payment_status: 'activated',
          package_id: pkg.id,
          payfast_payment_id: pfPaymentId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      console.log('Package activated:', { orderId, packageId: pkg.id })
    } else if (paymentStatus === 'CANCELLED') {
      await supabase
        .from('package_orders')
        .update({
          payment_status: 'cancelled',
          payfast_payment_id: pfPaymentId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
    } else {
      await supabase
        .from('package_orders')
        .update({
          payment_status: 'paid',
          payfast_payment_id: pfPaymentId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('ITN Error:', err)
    return new Response('ERROR', { status: 500 })
  }
})
