import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const washTypeToRelay: Record<string, string> = {
  basic: 'basic',
  standard: 'standard',
  premium: 'premium',
  ultimate: 'ultimate',
  ultimate_exterior: 'ultimate',
  ultimate_interior: 'ultimate',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    // Support multiple names for the site ID to be extremely safe
    const { plate, site_name } = body
    const rawSiteId = body.site_id || body.id || body.bay || "1"

    // Force targetBayId to be an integer
    const targetBayId = parseInt(rawSiteId.toString()) || 1

    console.log(`[WASH TRIGGER] Site: ${site_name}, Incoming ID: ${rawSiteId}, Target Bay: ${targetBayId}, Plate: ${plate}`)

    if (!plate || typeof plate !== 'string' || plate.trim().length < 3) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid plate format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanPlate = plate.toUpperCase().replace(/\s+/g, ' ').trim()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find active package
    const { data: pkg, error } = await supabase
      .from('wash_packages')
      .select('*')
      .eq('vehicle_reg', cleanPlate)
      .eq('active', true)
      .gt('end_date', new Date().toISOString())
      .lte('start_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('DB Error:', error)
      return new Response(
        JSON.stringify({ valid: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pkg) {
      console.log(`No package found for: ${cleanPlate}`)
      return new Response(
        JSON.stringify({ valid: false, error: 'No active package found for this vehicle' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the wash
    await supabase.from('package_wash_logs').insert({
      package_id: pkg.id,
      vehicle_reg: cleanPlate,
      wash_type: pkg.wash_type,
      site_name: site_name || 'Unknown Site',
      site_id: (rawSiteId.toString().length > 20) ? rawSiteId : null,
    })

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'

    // Open the correct gate
    console.log(`UPDATING BAY ${targetBayId} status to 'washing'`)
    const { error: updateError } = await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_wash_type: relayWashType,
        current_code: `PKG-${cleanPlate}`,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetBayId) // Ensure we use the parsed targetBayId

    if (updateError) {
      console.error('Relay Update Error:', updateError)
    }

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: relayWashType,
        vehicle_reg: pkg.vehicle_reg,
        days_remaining: Math.ceil((new Date(pkg.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Runtime Error:', err)
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
