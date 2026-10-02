import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

async function getMasterSiteUrl(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'master_site_url')
    .single()
  return data?.value || null
}

async function tryMasterSiteValidation(masterUrl: string, code: string): Promise<any | null> {
  try {
    const response = await fetch(`${masterUrl}/functions/v1/validate-package-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (response.ok) {
      return await response.json()
    }
    const errorData = await response.json().catch(() => null)
    return errorData
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { code, site_id, site_name } = body

    const rawSiteId = site_id ?? body.id
    const targetBayId = Number.parseInt(String(rawSiteId), 10)

    if (!rawSiteId || Number.isNaN(targetBayId)) {
      console.error('[Code Validation] Missing or invalid site_id', body)
      return new Response(
        JSON.stringify({ valid: false, error: 'Configuration Error: Site ID is missing. Check your kiosk URL.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Code Validation] Bay: ${targetBayId}, Site: ${site_name || 'Unknown'}, Code: ${code}`)

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid code format. Must be 6 digits.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Look up the code locally first
    const access = await getSiteAccess(supabase, targetBayId)
    if (!access) {
      return new Response(
        JSON.stringify({ valid: false, error: `Kiosk bay ${targetBayId} is not linked to a site. Check the kiosk URL.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (access.site.active === false) {
      return new Response(
        JSON.stringify({ valid: false, error: 'This site is currently inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Codes are 6 digits, so different sites may issue the same number: fetch candidates and pick the right one
    const availability = await bayAvailability(supabase, targetBayId, access.site)
    if (!availability.ok) return busyResponse(availability.wait)

    const { data: candidates, error: fetchError } = await supabase
      .from('wash_codes')
      .select('*')
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    // Single-wash codes only work at the site that issued them.
    // Multi-wash (package) codes also work at sites linked to the issuing site.
    const usable = (c: any) => c.site_id === access.site.id ||
      ((c.total_washes || 1) > 1 && c.site_id && access.linked.has(c.site_id))
    const washCode = (candidates || []).find(usable) || null
    const issuedElsewhere = !washCode && (candidates || []).length > 0

    if (fetchError) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a unique ID for the hardware to see
    const uniqueWashId = `${code}-${Date.now()}`;

    // If not found locally, try the master site for package codes
    if (issuedElsewhere) {
      return new Response(
        JSON.stringify({ valid: false, error: 'This code was issued at another site and is not valid here' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!washCode) {
      const masterUrl = await getMasterSiteUrl(supabase)
      if (masterUrl) {
        const masterResult = await tryMasterSiteValidation(masterUrl, code)
        if (masterResult?.valid) {
          await supabase
            .from('wash_bay_status')
            .update({
              status: 'washing',
              current_relay: clampRelay(LEGACY_RELAY[masterResult.wash_type], access.site.relay_count),
              current_wash_name: 'Package Wash',
              pulse_ms: access.site.pulse_ms || 1000,
              ...lockFields(access.site.package_duration_seconds ?? 600),
              current_wash_type: masterResult.wash_type,
              current_code: uniqueWashId,
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetBayId)

          return new Response(
            JSON.stringify(masterResult),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({ valid: false, error: 'Code not found or expired' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Reject codes that have used up all their washes
    if (washCode.used || (washCode.washes_used || 0) >= (washCode.total_washes || 1)) {
      return new Response(
        JSON.stringify({ valid: false, error: 'This code has already been used' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update usage and trigger the local bay
    const { error: updateError } = await supabase
      .from('wash_codes')
      .update({
        washes_used: (washCode.washes_used || 0) + 1,
        used: (washCode.total_washes || 1) <= ((washCode.washes_used || 0) + 1),
        used_at: new Date().toISOString(),
      })
      .eq('id', washCode.id)

    let durationSec = 600
    if (washCode.site_wash_id) {
      const { data: sw } = await supabase.from('site_washes').select('duration_seconds').eq('id', washCode.site_wash_id).maybeSingle()
      if (sw) durationSec = sw.duration_seconds
    }
    const relay = clampRelay(washCode.relay_number ?? LEGACY_RELAY[washCode.wash_type], access.site.relay_count)
    const washName = washCode.wash_name || `${String(washCode.wash_type).charAt(0).toUpperCase()}${String(washCode.wash_type).slice(1)} Wash`

    if (!updateError) {
      await supabase
        .from('wash_bay_status')
        .update({
          status: 'washing',
          current_relay: relay,
          current_wash_name: washName,
          ...lockFields(durationSec),
          pulse_ms: access.site.pulse_ms || 1000,
          current_wash_type: washCode.wash_type,
          current_code: uniqueWashId,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetBayId)
    }

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: washCode.wash_type,
        wash_name: washName,
        relay,
        code: washCode.code,
        wash_id: uniqueWashId
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
