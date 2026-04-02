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

    // NO DEFAULTS: If site_id is missing, the request is invalid.
    const rawId = body.site_id || body.id;

    if (!rawId) {
      console.error("CRITICAL ERROR: No site_id provided in request body", body)
      return new Response(
        JSON.stringify({ valid: false, error: 'Configuration Error: Site ID is missing. Check your URL.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const targetBayId = parseInt(rawId.toString())
    console.log(`[STRICT ACTION] Bay: ${targetBayId} | Site: ${site_name} | Plate: ${plate}`)

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
        JSON.stringify({ valid: false, error: 'No active package found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'

    // GENERATE UNIQUE HASH FOR THIS SPECIFIC WASH
    const uniqueWashId = `${cleanPlate}-${Date.now()}`;

    // Open the correct gate strictly by ID
    const { error: updateError } = await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_wash_type: relayWashType,
        current_code: uniqueWashId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetBayId)

    if (updateError) {
      console.error('DB ERROR:', updateError)
      return new Response(
        JSON.stringify({ valid: false, error: 'Failed to update bay status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the wash
    await supabase.from('package_wash_logs').insert({
      package_id: pkg.id,
      vehicle_reg: cleanPlate,
      wash_type: pkg.wash_type,
      site_name: site_name || `Bay ${targetBayId}`,
      site_id: (rawId.toString().length > 20) ? rawId : null,
    })

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: relayWashType,
        vehicle_reg: pkg.vehicle_reg,
        bay_triggered: targetBayId,
        wash_id: uniqueWashId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
