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
    const { plate, site_name } = body

    // Support multiple incoming property names for the site ID
    const rawSiteId = body.site_id || body.id || body.bay

    // STRICT CHECK: If no ID is provided, we default to 1 but LOG A WARNING
    if (!rawSiteId) {
      console.warn("WARNING: No site_id provided in request. Defaulting to Bay 1.")
    }

    const targetBayId = rawSiteId ? parseInt(rawSiteId.toString()) : 1

    console.log(`[TRIGGER] Bay: ${targetBayId} | Site: ${site_name} | Plate: ${plate}`)

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

    if (error || !pkg) {
      return new Response(
        JSON.stringify({ valid: false, error: pkg ? 'Database error' : 'No active package found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the wash
    await supabase.from('package_wash_logs').insert({
      package_id: pkg.id,
      vehicle_reg: cleanPlate,
      wash_type: pkg.wash_type,
      site_name: site_name || `Site ${targetBayId}`,
      site_id: (rawSiteId && rawSiteId.toString().length > 20) ? rawSiteId : null,
    })

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'

    // Open the correct gate
    const { error: updateError } = await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_wash_type: relayWashType,
        current_code: `PKG-${cleanPlate}`,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetBayId) // Crucial: This triggers the specific site

    if (updateError) console.error('DB Update Error:', updateError)

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: relayWashType,
        vehicle_reg: pkg.vehicle_reg,
        site_triggered: targetBayId
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
