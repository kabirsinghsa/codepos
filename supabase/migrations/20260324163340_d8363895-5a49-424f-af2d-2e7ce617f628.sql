
ALTER TABLE public.pos_products ADD COLUMN image_url text DEFAULT '';

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('pos-products', 'pos-products', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pos-products');

-- Allow public read
CREATE POLICY "Anyone can read product images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'pos-products');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pos-products');

-- Allow authenticated users to update
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pos-products');
