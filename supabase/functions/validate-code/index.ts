import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
    const { data: washCode, error: fetchError } = await supabase
      .from('wash_codes')
      .select('*')
      .eq('code', code)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a unique ID for the hardware to see
    const uniqueWashId = `${code}-${Date.now()}`;

    // If not found locally, try the master site for package codes
    if (!washCode) {
      const masterUrl = await getMasterSiteUrl(supabase)
      if (masterUrl) {
        const masterResult = await tryMasterSiteValidation(masterUrl, code)
        if (masterResult?.valid) {
          await supabase
            .from('wash_bay_status')
            .update({
              status: 'washing',
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

    if (!updateError) {
      await supabase
        .from('wash_bay_status')
        .update({
          status: 'washing',
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
