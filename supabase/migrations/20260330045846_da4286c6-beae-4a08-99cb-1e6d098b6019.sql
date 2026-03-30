
ALTER TABLE public.profiles ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

ALTER TABLE public.wash_codes ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
