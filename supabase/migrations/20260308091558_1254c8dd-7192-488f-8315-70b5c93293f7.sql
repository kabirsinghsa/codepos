-- Fix overly permissive wash_bay_status policies
DROP POLICY IF EXISTS "Allow all update" ON public.wash_bay_status;
CREATE POLICY "Approved users can update wash_bay_status"
ON public.wash_bay_status FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
  OR auth.uid() IS NULL
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
  OR auth.uid() IS NULL
);