
CREATE TABLE public.package_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  vehicle_reg text NOT NULL,
  vehicle_make text NOT NULL DEFAULT '',
  vehicle_colour text NOT NULL DEFAULT '',
  package_type text NOT NULL DEFAULT 'ultimate_exterior',
  duration_days integer NOT NULL DEFAULT 30,
  amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  payfast_payment_id text,
  package_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.package_orders ENABLE ROW LEVEL SECURITY;

-- Customers can read their own orders
CREATE POLICY "Users can read own orders"
ON public.package_orders FOR SELECT TO authenticated
USING (customer_id = auth.uid());

-- Approved staff can read all orders
CREATE POLICY "Approved users can read all orders"
ON public.package_orders FOR SELECT TO authenticated
USING (is_approved(auth.uid()));

-- Authenticated users can create orders (for themselves)
CREATE POLICY "Users can insert own orders"
ON public.package_orders FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid());

-- Service role can update orders (for PayFast webhook)
CREATE POLICY "Service role can update orders"
ON public.package_orders FOR UPDATE TO service_role
USING (true) WITH CHECK (true);

-- Service role can insert (for webhook)
CREATE POLICY "Service role can insert orders"
ON public.package_orders FOR INSERT TO service_role
WITH CHECK (true);

-- Add site_notification_phone to business_settings if not exists
INSERT INTO public.business_settings (key, value) VALUES ('site_notification_phone', '') ON CONFLICT (key) DO NOTHING;
