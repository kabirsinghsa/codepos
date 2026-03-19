import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Only look up multi-wash package codes (total_washes > 1)
    const { data: washCode, error: fetchError } = await supabase
      .from('wash_codes')
      .select('*')
      .eq('code', code)
      .gt('total_washes', 1)
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

    if (!washCode) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Package code not found or expired' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const totalWashes = washCode.total_washes ?? 1
    const washesUsed = washCode.washes_used ?? 0

    if (washesUsed >= totalWashes) {
      return new Response(
        JSON.stringify({ valid: false, error: 'All washes used up' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update usage on the master database
    const newWashesUsed = washesUsed + 1
    const isFullyUsed = newWashesUsed >= totalWashes

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
        JSON.stringify({ valid: false, error: 'Failed to update package usage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        valid: true,
        wash_type: washCode.wash_type,
        plc_input: washCode.plc_input,
        code: washCode.code,
        washes_remaining: totalWashes - newWashesUsed,
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
