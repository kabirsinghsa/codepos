import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Map package wash types to relay-compatible types
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
    const { plate, site_name, site_id } = await req.json()

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

    // Find active package for this registration
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
      return new Response(
        JSON.stringify({ valid: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pkg) {
      return new Response(
        JSON.stringify({ valid: false, error: 'No active package found for this vehicle' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine which wash bay to trigger (1, 2, or 3)
    const targetBayId = site_id ? parseInt(site_id.toString()) : 1;

    // Package found — log the wash with site info
    await supabase
      .from('package_wash_logs')
      .insert({
        package_id: pkg.id,
        vehicle_reg: cleanPlate,
        wash_type: pkg.wash_type,
        site_name: site_name || '',
        site_id: (site_id && site_id.toString().length > 20) ? site_id : null,
      })

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'

    // Start the wash for the specific site
    await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_wash_type: relayWashType,
        current_code: `PKG-${cleanPlate}`,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', isNaN(targetBayId) ? 1 : targetBayId)

    const daysRemaining = Math.ceil(
      (new Date(pkg.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: relayWashType,
        vehicle_reg: pkg.vehicle_reg,
        vehicle_make: pkg.vehicle_make,
        vehicle_colour: pkg.vehicle_colour,
        days_remaining: daysRemaining,
        end_date: pkg.end_date,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
