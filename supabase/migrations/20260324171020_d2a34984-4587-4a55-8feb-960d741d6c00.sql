CREATE POLICY "Approved users can insert business_settings"
ON public.business_settings
FOR INSERT
TO authenticated
WITH CHECK (is_approved(auth.uid()));