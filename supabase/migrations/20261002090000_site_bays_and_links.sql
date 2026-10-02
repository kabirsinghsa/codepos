-- Each site gets its own kiosk/bay number, its own codes, and packages are only
-- shared between sites that an admin has explicitly linked.

-- 1. Bay number per site (used in the kiosk URL ?site_id=N and by the ESP32 BAY_ID)
CREATE SEQUENCE IF NOT EXISTS public.sites_bay_id_seq START 1;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS bay_id integer UNIQUE;

-- Backfill existing sites in creation order
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.sites WHERE bay_id IS NULL ORDER BY created_at LOOP
    n := (SELECT COALESCE(MAX(bay_id), 0) FROM public.sites) + 1;
    UPDATE public.sites SET bay_id = n WHERE id = r.id;
  END LOOP;
  PERFORM setval('public.sites_bay_id_seq', GREATEST((SELECT COALESCE(MAX(bay_id), 0) FROM public.sites), 1),
                 (SELECT COUNT(*) > 0 FROM public.sites WHERE bay_id IS NOT NULL));
END $$;
ALTER TABLE public.sites ALTER COLUMN bay_id SET DEFAULT nextval('public.sites_bay_id_seq');
ALTER SEQUENCE public.sites_bay_id_seq OWNED BY public.sites.bay_id;

-- Make sure every site has a bay status row
INSERT INTO public.wash_bay_status (id, status)
SELECT bay_id, 'idle' FROM public.sites WHERE bay_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_bay_for_site()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.wash_bay_status (id, status) VALUES (NEW.bay_id, 'idle') ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_site_created_bay ON public.sites;
CREATE TRIGGER on_site_created_bay AFTER INSERT ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.create_bay_for_site();

-- 2. Site links (packages from one site are valid at linked sites)
CREATE TABLE IF NOT EXISTS public.site_links (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  linked_site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, linked_site_id),
  CHECK (site_id <> linked_site_id)
);
ALTER TABLE public.site_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can read site_links" ON public.site_links FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY "Admins can add site_links" ON public.site_links FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can remove site_links" ON public.site_links FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- True if a code/package from home_site may be used at target_site
CREATE OR REPLACE FUNCTION public.sites_are_linked(home_site uuid, target_site uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT home_site IS NOT NULL AND target_site IS NOT NULL AND (
    home_site = target_site OR EXISTS (
      SELECT 1 FROM public.site_links
      WHERE (site_id = home_site AND linked_site_id = target_site)
         OR (site_id = target_site AND linked_site_id = home_site)
    ));
$$;
