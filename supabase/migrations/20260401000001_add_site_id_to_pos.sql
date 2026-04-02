-- Add site_id to pos_transactions to track sales per location
ALTER TABLE public.pos_transactions ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- Create an index for performance
CREATE INDEX IF NOT EXISTS idx_pos_transactions_site_id ON public.pos_transactions(site_id);
