
-- Create wash_prices table to store editable prices per wash type
CREATE TABLE public.wash_prices (
  wash_type text PRIMARY KEY,
  price numeric NOT NULL DEFAULT 0,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed with current defaults
INSERT INTO public.wash_prices (wash_type, price, name, description) VALUES
  ('basic', 90, 'Basic Wash', 'Exterior rinse & dry'),
  ('standard', 10, 'Standard Wash', 'Soap, rinse & dry'),
  ('premium', 40, 'Premium Wash', 'Full wash with wax'),
  ('ultimate', 20, 'Ultimate Wash', 'Complete detail wash');

-- Enable RLS
ALTER TABLE public.wash_prices ENABLE ROW LEVEL SECURITY;

-- Everyone can read prices (needed for kiosk too)
CREATE POLICY "Anyone can read wash_prices"
  ON public.wash_prices FOR SELECT
  USING (true);

-- Only approved users can update prices
CREATE POLICY "Approved users can update wash_prices"
  ON public.wash_prices FOR UPDATE
  TO authenticated
  USING (public.is_approved(auth.uid()))
  WITH CHECK (public.is_approved(auth.uid()));
