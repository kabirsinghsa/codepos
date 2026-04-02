-- Create a table to track stock levels per site
CREATE TABLE IF NOT EXISTS public.pos_inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.pos_products(id) ON DELETE CASCADE,
    site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
    quantity integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(product_id, site_id)
);

-- Add a global stock track if you don't want per-site (but per-site is better for your setup)
-- Enabling RLS
ALTER TABLE public.pos_inventory ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write for now
CREATE POLICY "Allow all access to inventory" ON public.pos_inventory FOR ALL USING (true);
