
CREATE TABLE public.package_wash_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.wash_packages(id) ON DELETE CASCADE,
  vehicle_reg text NOT NULL,
  wash_type text NOT NULL DEFAULT 'basic',
  washed_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.package_wash_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read package_wash_logs"
  ON public.package_wash_logs FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Service role can insert package_wash_logs"
  ON public.package_wash_logs FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Anon can read package_wash_logs"
  ON public.package_wash_logs FOR SELECT TO anon
  USING (true);
