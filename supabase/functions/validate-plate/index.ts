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
    const { plate, site_name, site_id } = body

    // 1. STRICT SITE ID DETECTION (No Defaults)
    const rawId = site_id || body.id;
    if (!rawId) {
      console.error("CRITICAL ERROR: No site_id provided in request body", body)
      return new Response(JSON.stringify({ valid: false, error: 'Kiosk Error: Site ID missing' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const targetBayId = parseInt(rawId.toString())
    console.log(`[STRICT ACTION] Request from: ${site_name} | Parsed Bay ID: ${targetBayId} | Plate: ${plate}`)

    const cleanPlate = plate.toUpperCase().replace(/\s+/g, ' ').trim()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 2. Find active package
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
      console.log(`[FAILED] No package for plate: ${cleanPlate}`)
      return new Response(JSON.stringify({ valid: false, error: 'No active package found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'
    const uniqueWashId = `${cleanPlate}-${Date.now()}`

    // 3. TRIGGER SPECIFIC BAY
    console.log(`[DATABASE] Updating Bay ${targetBayId} to 'washing' state with ID: ${uniqueWashId}`)
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
      console.error("[DATABASE ERROR]", updateError)
      throw updateError;
    }

    // 4. Log the wash
    await supabase.from('package_wash_logs').insert({
      package_id: pkg.id,
      vehicle_reg: cleanPlate,
      wash_type: pkg.wash_type,
      site_name: site_name || `Bay ${targetBayId}`,
    })

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: relayWashType,
        bay_triggered: targetBayId,
        wash_id: uniqueWashId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('RUNTIME ERROR:', err)
    return new Response(JSON.stringify({ valid: false, error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
