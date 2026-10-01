import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'AI API key not configured (set ANTHROPIC_API_KEY)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const file = formData.get('upload');
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert image to base64 (chunked, so large photos don't crash)
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = encodeBase64(bytes);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const mimeType = allowed.includes(file.type) ? file.type : 'image/jpeg';

    // Claude vision (Anthropic API)
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: `You are a South African license plate reader. Look at this image and extract the vehicle license plate number. South African plates typically have formats like: ABC 123 GP, CA 123-456, CF 12345, etc.

IMPORTANT RULES:
- Return ONLY the plate text in uppercase, nothing else
- Remove any dashes, use spaces between groups
- If you see multiple plates, return the most prominent/readable one
- If you cannot see any plate clearly, respond with exactly: NO_PLATE
- Do NOT add any explanation, just the plate text or NO_PLATE` },
          ],
        }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'AI recognition failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const rawPlate = (aiData.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

    console.log('AI raw response:', rawPlate);

    if (!rawPlate || rawPlate === 'NO_PLATE') {
      return new Response(JSON.stringify({ plate: '', score: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean the plate text
    const plate = rawPlate
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return new Response(JSON.stringify({ plate, score: 0.95 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
