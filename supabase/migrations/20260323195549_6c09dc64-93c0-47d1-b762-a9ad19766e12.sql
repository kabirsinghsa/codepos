
-- POS Products table
CREATE TABLE public.pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'General',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active pos_products" ON public.pos_products
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can insert pos_products" ON public.pos_products
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pos_products" ON public.pos_products
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete pos_products" ON public.pos_products
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- POS Transactions table
CREATE TABLE public.pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total numeric NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read pos_transactions" ON public.pos_transactions
  FOR SELECT TO authenticated USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert pos_transactions" ON public.pos_transactions
  FOR INSERT TO authenticated WITH CHECK (is_approved(auth.uid()));

-- POS Transaction Items table
CREATE TABLE public.pos_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.pos_transactions(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_description text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.pos_transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read pos_transaction_items" ON public.pos_transaction_items
  FOR SELECT TO authenticated USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can insert pos_transaction_items" ON public.pos_transaction_items
  FOR INSERT TO authenticated WITH CHECK (is_approved(auth.uid()));
