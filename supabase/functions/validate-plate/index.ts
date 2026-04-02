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

    // 1. STRICT ID DETECTION
    const rawId = site_id || body.id;
    if (!rawId) {
      console.error("ERROR: No site_id provided")
      return new Response(JSON.stringify({ valid: false, error: 'Kiosk Error: Site ID missing' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const targetBayId = parseInt(rawId.toString())
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
      return new Response(JSON.stringify({ valid: false, error: 'No active package found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'

    // 3. GENERATE UNIQUE WASH ID (Timestamped)
    // This is the "Lock" that prevents the ESP32 from firing twice
    const uniqueWashId = `WASH-${cleanPlate}-${Date.now()}`;

    // 4. TRIGGER THE SPECIFIC SITE
    console.log(`[ACTION] Triggering Bay ${targetBayId} for ${site_name}`)
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

    if (updateError) throw updateError;

    // 5. Log the wash
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
        vehicle_reg: pkg.vehicle_reg,
        site_triggered: targetBayId,
        wash_id: uniqueWashId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('SERVER ERROR:', err)
    return new Response(JSON.stringify({ valid: false, error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
