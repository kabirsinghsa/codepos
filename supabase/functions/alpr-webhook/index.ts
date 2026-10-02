import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const washTypeToRelay: Record<string, string> = {
  basic: 'basic',
  standard: 'standard',
  premium: 'premium',
  ultimate: 'ultimate',
  ultimate_exterior: 'ultimate',
  ultimate_interior: 'ultimate',
}

// Resolve the kiosk bay number to its site, plus the sites linked to it.
// Old codes without a relay: Basic=1, Standard=2, Premium=3, Ultimate=4
const LEGACY_RELAY: Record<string, number> = { basic: 1, standard: 2, premium: 3, ultimate: 4 }
const clampRelay = (r: number | null | undefined, count: number) => {
  const n = Number(r) || 1
  return n >= 1 && n <= (count || 1) ? n : 1
}

async function getSiteAccess(supabase: any, bayId: number) {
  const { data: site } = await supabase
    .from('sites').select('id, name, active, relay_count, pulse_ms, package_relay').eq('bay_id', bayId).maybeSingle()
  if (!site) return null
  const { data: links } = await supabase
    .from('site_links').select('site_id, linked_site_id')
    .or(`site_id.eq.${site.id},linked_site_id.eq.${site.id}`)
  const linked = new Set<string>()
  links?.forEach((l: any) => linked.add(l.site_id === site.id ? l.linked_site_id : l.site_id))
  return { site, linked }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // SECURITY: require a shared secret so only your cameras can trigger washes.
  // Set the ALPR_WEBHOOK_SECRET secret in Supabase, then add ?key=YOUR_SECRET to the
  // camera's webhook URL (or send it in an "x-webhook-key" header).
  const webhookSecret = Deno.env.get('ALPR_WEBHOOK_SECRET')
  const providedKey = new URL(req.url).searchParams.get('key') || req.headers.get('x-webhook-key') || ''
  if (!webhookSecret || providedKey !== webhookSecret) {
    console.warn(webhookSecret ? '[ALPR] Rejected request with missing/invalid webhook key' : '[ALPR] ALPR_WEBHOOK_SECRET not set - rejecting all requests')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
    const access = await getSiteAccess(supabase, targetBayId)
    if (!access) return json({ valid: false, error: `Bay ${targetBayId} is not linked to a site` }, 404)

    const now = new Date().toISOString()
    const { data: allActive } = await supabase
      .from('wash_packages')
      .select('*')
      .eq('active', true)
      .gt('end_date', now)
      .lte('start_date', now)
      .order('created_at', { ascending: false })

    const noSpacePlate = cleanPlate.replace(/\s/g, '')
    const allowedHere = (p: any) => p.site_id === access.site.id || (p.site_id && access.linked.has(p.site_id))
    const matches = (allActive || []).filter((p: any) => p.vehicle_reg.replace(/\s/g, '') === noSpacePlate)
    const pkg = matches.find(allowedHere) || null

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
        current_relay: clampRelay(access.site.package_relay, access.site.relay_count),
        current_wash_name: 'Package Wash',
        pulse_ms: access.site.pulse_ms || 1000,
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
      site_name: access.site.name,
      site_id: access.site.id,
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
