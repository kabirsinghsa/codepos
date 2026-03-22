
-- Create the public "apps" storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('apps', 'apps', true);

-- Allow anyone to read/download files
CREATE POLICY "Public read access on apps bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'apps');

-- Allow authenticated approved users to upload files
CREATE POLICY "Approved users can upload to apps bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'apps' AND public.is_approved(auth.uid()));

-- Allow authenticated approved users to update files
CREATE POLICY "Approved users can update apps bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'apps' AND public.is_approved(auth.uid()))
WITH CHECK (bucket_id = 'apps' AND public.is_approved(auth.uid()));

-- Allow authenticated approved users to delete files
CREATE POLICY "Approved users can delete from apps bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'apps' AND public.is_approved(auth.uid()));
