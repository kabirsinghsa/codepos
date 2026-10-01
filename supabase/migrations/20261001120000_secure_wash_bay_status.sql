-- SECURITY: stop anonymous users from starting washes.
-- Previously the UPDATE policy allowed "auth.uid() IS NULL", so anyone holding the
-- public anon key (shipped in the web app) could set a bay to 'washing' for free.
-- Washes are now started only by the edge functions (validate-code, validate-plate,
-- alpr-webhook), which use the service role and bypass RLS.

DROP POLICY IF EXISTS "Allow all update" ON public.wash_bay_status;
DROP POLICY IF EXISTS "Approved users can update wash_bay_status" ON public.wash_bay_status;

CREATE POLICY "Approved users can update wash_bay_status"
ON public.wash_bay_status FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true));

-- The kiosk (not logged in) still needs to return a bay to 'idle' after a wash.
-- This function can ONLY set a bay back to idle, never start a wash, and only once
-- the wash has been running for at least 8 seconds (so the ESP32 has time to poll).
CREATE OR REPLACE FUNCTION public.reset_bay_idle(p_bay_id integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wash_bay_status
  SET status = 'idle',
      current_wash_type = NULL,
      current_code = NULL,
      started_at = NULL,
      updated_at = now()
  WHERE id = p_bay_id
    AND status <> 'idle'
    AND (started_at IS NULL OR started_at < now() - interval '8 seconds');
$$;

REVOKE ALL ON FUNCTION public.reset_bay_idle(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_bay_idle(integer) TO anon, authenticated;
