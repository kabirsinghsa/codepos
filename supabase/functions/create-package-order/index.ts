import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    return new Response(
      JSON.stringify({ success: true, order_id: order.id }),
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
