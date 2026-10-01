import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // SECURITY: only approved staff may manually activate an order
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: userData } = await authClient.auth.getUser(token)
    const userId = userData?.user?.id
    if (!userId) return json({ error: 'Not signed in' }, 401)
    const { data: profile } = await authClient.from('profiles').select('approved').eq('id', userId).maybeSingle()
    if (!profile?.approved) return json({ error: 'Not authorised' }, 403)

    const { order_id } = await req.json()

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('package_orders')
      .select('*')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (order.payment_status === 'activated') {
      return new Response(
        JSON.stringify({ error: 'Order already activated' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create the wash package
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
      return new Response(
        JSON.stringify({ error: 'Failed to create package' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the order status
    await supabase
      .from('package_orders')
      .update({
        payment_status: 'activated',
        package_id: pkg.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id)

    return new Response(
      JSON.stringify({ success: true, package_id: pkg.id }),
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
