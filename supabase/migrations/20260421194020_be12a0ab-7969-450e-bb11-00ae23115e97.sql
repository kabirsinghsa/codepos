
DROP POLICY IF EXISTS "Admins upload theme-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins update theme-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete theme-assets" ON storage.objects;

CREATE POLICY "Approved users upload theme-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'theme-assets' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved users update theme-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'theme-assets' AND public.is_approved(auth.uid())) WITH CHECK (bucket_id = 'theme-assets' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved users delete theme-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'theme-assets' AND public.is_approved(auth.uid()));
