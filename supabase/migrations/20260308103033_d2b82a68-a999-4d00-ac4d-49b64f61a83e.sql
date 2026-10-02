
CREATE TABLE public.business_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read business_settings"
  ON public.business_settings FOR SELECT
  USING (true);

CREATE POLICY "Approved users can update business_settings"
  ON public.business_settings FOR UPDATE
  USING (is_approved(auth.uid()))
  WITH CHECK (is_approved(auth.uid()));

INSERT INTO public.business_settings (key, value) VALUES
  ('business_name', 'GES CODE CONTROLLER'),
  ('business_phone', '000-000-0000'),
  ('receipt_footer', 'Scan QR code at the wash bay to start.');
