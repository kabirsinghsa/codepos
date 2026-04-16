import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI API key not configured' }), {
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

    // Convert image to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = file.type || 'image/jpeg';

    // Use Gemini Flash vision via Lovable AI Gateway
    const aiResp = await fetch('https://ai-gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a South African license plate reader. Look at this image and extract the vehicle license plate number. South African plates typically have formats like: ABC 123 GP, CA 123-456, CF 12345, etc.

IMPORTANT RULES:
- Return ONLY the plate text in uppercase, nothing else
- Remove any dashes, use spaces between groups
- If you see multiple plates, return the most prominent/readable one
- If you cannot see any plate clearly, respond with exactly: NO_PLATE
- Do NOT add any explanation, just the plate text or NO_PLATE`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 50,
        temperature: 0,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('AI Gateway error:', errText);
      return new Response(JSON.stringify({ error: 'AI recognition failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const rawPlate = aiData.choices?.[0]?.message?.content?.trim() || '';
    
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
