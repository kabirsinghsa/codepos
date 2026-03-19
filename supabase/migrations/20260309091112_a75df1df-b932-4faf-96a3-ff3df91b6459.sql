
CREATE TABLE public.wash_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wash_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wash_extras" ON public.wash_extras
  FOR SELECT USING (true);

CREATE POLICY "Approved users can update wash_extras" ON public.wash_extras
  FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()))
  WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert wash_extras" ON public.wash_extras
  FOR INSERT TO authenticated
  WITH CHECK (is_approved(auth.uid()));

CREATE POLICY "Approved users can delete wash_extras" ON public.wash_extras
  FOR DELETE TO authenticated
  USING (is_approved(auth.uid()));
