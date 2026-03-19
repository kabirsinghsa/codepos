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
    const { code } = await req.json()

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

    // If not found locally, try the master site for package codes
    if (!washCode) {
      const masterUrl = await getMasterSiteUrl(supabase)
      if (masterUrl) {
        const masterResult = await tryMasterSiteValidation(masterUrl, code)
        if (masterResult?.valid) {
          // Master validated the package code - update local wash bay
          await supabase
            .from('wash_bay_status')
            .update({
              status: 'washing',
              current_wash_type: masterResult.wash_type,
              current_code: masterResult.code,
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          return new Response(
            JSON.stringify(masterResult),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // If master returned a specific error, pass it through
        if (masterResult?.error && masterResult.error !== 'Package code not found or expired') {
          return new Response(
            JSON.stringify({ valid: false, error: masterResult.error }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({ valid: false, error: 'Code not found or expired' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const totalWashes = washCode.total_washes ?? 1
    const washesUsed = washCode.washes_used ?? 0

    // Check if code is fully used
    if (totalWashes <= 1 && washCode.used) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Code already used' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (totalWashes > 1 && washesUsed >= totalWashes) {
      return new Response(
        JSON.stringify({ valid: false, error: 'All washes used up' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update usage
    const newWashesUsed = washesUsed + 1
    const isFullyUsed = totalWashes <= 1 || newWashesUsed >= totalWashes

    const { error: updateError } = await supabase
      .from('wash_codes')
      .update({
        washes_used: newWashesUsed,
        used: isFullyUsed,
        used_at: isFullyUsed ? new Date().toISOString() : washCode.used_at,
      })
      .eq('id', washCode.id)

    if (updateError) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Failed to mark code as used' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update wash bay status to 'washing'
    await supabase
      .from('wash_bay_status')
      .update({
        status: 'washing',
        current_wash_type: washCode.wash_type,
        current_code: washCode.code,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: washCode.wash_type,
        plc_input: washCode.plc_input,
        code: washCode.code,
        washes_remaining: totalWashes > 1 ? totalWashes - newWashesUsed : 0,
        total_washes: totalWashes,
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
