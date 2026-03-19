
CREATE TABLE public.wash_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL DEFAULT '',
  vehicle_reg text NOT NULL,
  vehicle_make text NOT NULL DEFAULT '',
  vehicle_colour text NOT NULL DEFAULT '',
  wash_type text NOT NULL DEFAULT 'basic',
  price numeric NOT NULL DEFAULT 0,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wash_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read wash_packages" ON public.wash_packages
  FOR SELECT TO authenticated
  USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert wash_packages" ON public.wash_packages
  FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Approved users can update wash_packages" ON public.wash_packages
  FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()))
  WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Approved users can delete wash_packages" ON public.wash_packages
  FOR DELETE TO authenticated
  USING (is_approved(auth.uid()));

CREATE POLICY "Anon can read wash_packages by reg" ON public.wash_packages
  FOR SELECT TO anon
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.wash_packages;
