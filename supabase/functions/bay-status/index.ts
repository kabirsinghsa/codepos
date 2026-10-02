import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Called by each site's ESP32 (no JWT) to report whether the wash machine is busy.
// Body: { "bay_id": 1, "busy": true }   Header: x-device-key: <site device key>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-key',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { bay_id, busy } = await req.json()
    const bayId = parseInt(String(bay_id))
    const key = req.headers.get('x-device-key') || ''
    if (!bayId || typeof busy !== 'boolean' || !key) return json({ error: 'bay_id, busy and x-device-key are required' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: site } = await supabase.from('sites').select('id').eq('bay_id', bayId).maybeSingle()
    if (!site) return json({ error: 'Unknown bay' }, 404)
    const { data: device } = await supabase.from('site_devices').select('device_key').eq('site_id', site.id).maybeSingle()
    if (!device || device.device_key !== key) return json({ error: 'Unauthorized' }, 401)

    const { data: bay } = await supabase.from('wash_bay_status').select('machine_busy').eq('id', bayId).maybeSingle()
    const update: Record<string, unknown> = { machine_busy: busy, busy_updated_at: new Date().toISOString() }
    // Machine just finished: release the time lock straight away
    if (bay?.machine_busy && !busy) update.locked_until = new Date().toISOString()

    const { error } = await supabase.from('wash_bay_status').update(update).eq('id', bayId)
    if (error) throw error
    return json({ ok: true, busy })
  } catch (err) {
    console.error('[bay-status]', err)
    return json({ error: 'Invalid request' }, 400)
  }
})
