-- Applied when moving off Lovable Cloud to the self-owned Supabase project.

-- 1. Stock could be changed by anyone (even logged out)
DROP POLICY IF EXISTS "Allow all access to inventory" ON public.pos_inventory;
CREATE OR REPLACE FUNCTION public.decrement_inventory(p_product_id uuid, p_site_id uuid, p_quantity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pos_inventory SET quantity = quantity - p_quantity, updated_at = now()
  WHERE product_id = p_product_id AND site_id = p_site_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decrement_inventory(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(uuid, uuid, integer) TO authenticated;

-- 2. PayFast merchant key and passphrase were publicly readable
DROP POLICY IF EXISTS "Anyone can read business_settings" ON public.business_settings;
CREATE POLICY "Anyone can read non-secret business_settings" ON public.business_settings
  FOR SELECT USING (key NOT IN ('payfast_merchant_key', 'payfast_passphrase'));
CREATE POLICY "Approved users can read all business_settings" ON public.business_settings
  FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));

-- 3. Bay rows for kiosk sites 2 and 3
INSERT INTO public.wash_bay_status (id, status) VALUES (2, 'idle'), (3, 'idle') ON CONFLICT (id) DO NOTHING;

-- 4. First account to sign up becomes an approved admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
  INSERT INTO public.profiles (id, display_name, approved)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''), is_first);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
