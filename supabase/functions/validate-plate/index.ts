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

// Resolve the kiosk bay number to its site, plus the sites linked to it.
// Old codes without a relay: Basic=1, Standard=2, Premium=3, Ultimate=4
const LEGACY_RELAY: Record<string, number> = { basic: 1, standard: 2, premium: 3, ultimate: 4 }
const clampRelay = (r: number | null | undefined, count: number) => {
  const n = Number(r) || 1
  return n >= 1 && n <= (count || 1) ? n : 1
}

// ---- Busy lock: never start a second wash while the machine is still running ----
const GRACE_MS = 30_000   // after a start, give the PLC time to raise its busy signal
const STALE_MS = 60_000   // busy reports older than this = ESP32 offline, fall back to the timer
async function bayAvailability(supabase: any, bayId: number, site: any) {
  const { data: bay } = await supabase.from('wash_bay_status')
    .select('machine_busy, busy_updated_at, locked_until, last_started_at').eq('id', bayId).maybeSingle()
  const now = Date.now()
  const started = bay?.last_started_at ? Date.parse(bay.last_started_at) : 0
  if (started && now - started < GRACE_MS) return { ok: false, wait: Math.ceil((GRACE_MS - (now - started)) / 1000) }
  const fresh = site.busy_input_enabled && bay?.busy_updated_at && now - Date.parse(bay.busy_updated_at) < STALE_MS
  if (fresh) return bay.machine_busy ? { ok: false, wait: null } : { ok: true }
  const until = bay?.locked_until ? Date.parse(bay.locked_until) : 0
  if (until > now) return { ok: false, wait: Math.ceil((until - now) / 1000) }
  return { ok: true }
}
const busyResponse = (wait: number | null) => new Response(
  JSON.stringify({ valid: false, busy: true, wait_seconds: wait,
    error: wait ? `Machine busy. Please wait about ${wait >= 90 ? Math.ceil(wait / 60) + ' min' : wait + ' sec'}. Your code has not been used.` : 'Machine busy, please wait. Your code has not been used.' }),
  { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const lockFields = (durationSec: number) => ({
  last_started_at: new Date().toISOString(),
  locked_until: new Date(Date.now() + Math.max(0, durationSec) * 1000).toISOString(),
})

async function getSiteAccess(supabase: any, bayId: number) {
  const { data: site } = await supabase
    .from('sites').select('id, name, active, relay_count, pulse_ms, package_relay, busy_input_enabled, package_duration_seconds').eq('bay_id', bayId).maybeSingle()
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
    const access = await getSiteAccess(supabase, targetBayId)
    if (!access) {
      return new Response(JSON.stringify({ valid: false, error: `Kiosk bay ${targetBayId} is not linked to a site` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const availability = await bayAvailability(supabase, targetBayId, access.site)
    if (!availability.ok) return busyResponse(availability.wait)

    const now = new Date().toISOString()
    const { data: pkgs, error } = await supabase
      .from('wash_packages')
      .select('*')
      .eq('vehicle_reg', cleanPlate)
      .eq('active', true)
      .gt('end_date', now)
      .lte('start_date', now)
      .order('created_at', { ascending: false })

    // Packages only work at their own site, or at sites an admin has linked to it
    const pkg = (pkgs || []).find((p: any) => p.site_id === access.site.id || (p.site_id && access.linked.has(p.site_id))) || null

    if (error || !pkg) {
      const elsewhere = (pkgs || []).length > 0
      console.log(`[FAILED] No usable package for plate: ${cleanPlate} at ${access.site.name}`)
      return new Response(JSON.stringify({ valid: false, error: elsewhere ? 'This package belongs to another site and is not valid here' : 'No active package found' }), { status: elsewhere ? 403 : 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const relayWashType = washTypeToRelay[pkg.wash_type] || 'ultimate'
    const uniqueWashId = `${cleanPlate}-${Date.now()}`

    // 3. TRIGGER SPECIFIC BAY
    console.log(`[DATABASE] Updating Bay ${targetBayId} to 'washing' state with ID: ${uniqueWashId}`)
    const { error: updateError } = await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_relay: clampRelay(access.site.package_relay, access.site.relay_count),
        current_wash_name: 'Package Wash',
        pulse_ms: access.site.pulse_ms || 1000,
        ...lockFields(access.site.package_duration_seconds ?? 600),
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
      site_name: access.site.name,
      site_id: access.site.id,
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
