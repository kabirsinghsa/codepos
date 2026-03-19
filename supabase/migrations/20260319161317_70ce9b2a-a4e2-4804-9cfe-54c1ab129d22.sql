
-- Create trigger function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, approved)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''), false);
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert profile for existing user (Kabir@ges.co.za) and approve them
-- We need to get the user id from auth.users
INSERT INTO public.profiles (id, display_name, approved)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', 'Kabir'), true
FROM auth.users
WHERE email = 'Kabir@ges.co.za'
ON CONFLICT (id) DO UPDATE SET approved = true;

-- Also ensure admin role exists for this user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'Kabir@ges.co.za'
ON CONFLICT (user_id, role) DO NOTHING;
