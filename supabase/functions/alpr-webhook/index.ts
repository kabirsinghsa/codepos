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
    // Support both JSON and query params (different cameras send data differently)
    let plate = ''
    let site_id = ''
    let site_name = ''

    if (req.method === 'GET') {
      // Some cameras send via GET with query params
      const url = new URL(req.url)
      plate = url.searchParams.get('plate') || url.searchParams.get('PlateNumber') || url.searchParams.get('license_plate') || ''
      site_id = url.searchParams.get('site_id') || url.searchParams.get('channel') || ''
      site_name = url.searchParams.get('site_name') || ''
    } else {
      // POST with JSON or form data
      const contentType = req.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        const body = await req.json()
        // Support common ALPR camera JSON formats
        // Hikvision: { "PlateNumber": "ABC123GP", "channel": "1" }
        // Dahua: { "PlateNumber": "ABC123GP", "Channel": "1" }
        // Generic: { "plate": "ABC 123 GP", "site_id": "2" }
        plate = body.plate || body.PlateNumber || body.license_plate || body.plateNumber || ''
        site_id = body.site_id || body.channel || body.Channel || body.channelId || ''
        site_name = body.site_name || body.deviceName || ''
      } else if (contentType.includes('form')) {
        const formData = await req.formData()
        plate = (formData.get('plate') || formData.get('PlateNumber') || formData.get('license_plate') || '') as string
        site_id = (formData.get('site_id') || formData.get('channel') || '') as string
        site_name = (formData.get('site_name') || '') as string
      } else {
        // Try JSON as fallback
        try {
          const body = await req.json()
          plate = body.plate || body.PlateNumber || body.license_plate || ''
          site_id = body.site_id || body.channel || ''
          site_name = body.site_name || ''
        } catch {
          return new Response(JSON.stringify({ error: 'Could not parse request body' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    if (!plate) {
      console.error('No plate number received. Headers:', Object.fromEntries(req.headers.entries()))
      return new Response(JSON.stringify({ error: 'No plate number provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!site_id) {
      console.error('No site_id/channel provided')
      return new Response(JSON.stringify({ error: 'No site_id or channel provided. Configure your camera to include site_id parameter.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetBayId = parseInt(site_id.toString())
    const cleanPlate = plate.toUpperCase().replace(/[\s\-]+/g, ' ').trim()

    console.log(`[ALPR CAMERA] Plate: ${cleanPlate} | Bay: ${targetBayId} | Site: ${site_name}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find active package for this plate
    // Try exact match first, then try without spaces
    const now = new Date().toISOString()
    let pkg = null

    const { data: exactMatch } = await supabase
      .from('wash_packages')
      .select('*')
      .eq('vehicle_reg', cleanPlate)
      .eq('active', true)
      .gt('end_date', now)
      .lte('start_date', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (exactMatch) {
      pkg = exactMatch
    } else {
      // Try matching without spaces (cameras may send plates without spaces)
      const noSpacePlate = cleanPlate.replace(/\s/g, '')
      const { data: allActive } = await supabase
        .from('wash_packages')
        .select('*')
        .eq('active', true)
        .gt('end_date', now)
        .lte('start_date', now)

      if (allActive) {
        pkg = allActive.find(p => p.vehicle_reg.replace(/\s/g, '') === noSpacePlate) || null
      }
    }

    if (!pkg) {
      console.log(`[ALPR] No active package for plate: ${cleanPlate}`)
      return new Response(JSON.stringify({ 
        valid: false, 
        plate: cleanPlate,
        error: 'No active package found for this vehicle' 
      }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'
    const uniqueWashId = `ALPR-${cleanPlate}-${Date.now()}`

    // Trigger the wash bay
    console.log(`[ALPR] Triggering Bay ${targetBayId} for ${cleanPlate} - ${relayWashType} wash`)
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
      console.error('[ALPR] Bay update error:', updateError)
      throw updateError
    }

    // Log the wash
    await supabase.from('package_wash_logs').insert({
      package_id: pkg.id,
      vehicle_reg: cleanPlate,
      wash_type: pkg.wash_type,
      site_name: site_name || `Bay ${targetBayId} (ALPR)`,
    })

    console.log(`[ALPR] SUCCESS - ${cleanPlate} → Bay ${targetBayId} (${relayWashType})`)

    return new Response(JSON.stringify({
      valid: true,
      plate: cleanPlate,
      wash_type: relayWashType,
      bay_triggered: targetBayId,
      wash_id: uniqueWashId,
      package_end_date: pkg.end_date,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[ALPR] Runtime error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
