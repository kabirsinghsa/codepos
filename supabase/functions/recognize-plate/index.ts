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
    const token = Deno.env.get('PLATE_RECOGNIZER_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ error: 'PlateRecognizer token not configured' }), {
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

    const apiForm = new FormData();
    apiForm.append('upload', file, 'plate.jpg');
    apiForm.append('regions', 'za'); // South Africa

    const resp = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      body: apiForm,
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('PlateRecognizer error:', data);
      return new Response(JSON.stringify({ error: 'Plate recognition failed', details: data }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const plate = data.results?.[0]?.plate?.toUpperCase() ?? '';
    const score = data.results?.[0]?.score ?? 0;

    return new Response(JSON.stringify({ plate, score, results: data.results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
