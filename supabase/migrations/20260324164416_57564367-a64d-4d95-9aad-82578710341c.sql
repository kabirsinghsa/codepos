
-- Sites table
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Anyone can read active sites
CREATE POLICY "Anyone can read sites" ON public.sites FOR SELECT TO public USING (true);

-- Admins can manage sites
CREATE POLICY "Admins can insert sites" ON public.sites FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update sites" ON public.sites FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete sites" ON public.sites FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Add site_id to package_wash_logs
ALTER TABLE public.package_wash_logs ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- Add site_id to wash_packages (optional, tracks which site created it)
ALTER TABLE public.wash_packages ADD COLUMN site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
