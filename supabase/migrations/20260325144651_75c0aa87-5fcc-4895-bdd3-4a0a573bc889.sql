
-- Create the missing trigger for handle_new_user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert profile for existing user
INSERT INTO public.profiles (id, display_name, approved)
VALUES ('31d85a1b-a968-4510-ad64-c619264c000a', 'Kabir Singh', true)
ON CONFLICT (id) DO UPDATE SET approved = true;

-- Grant admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('31d85a1b-a968-4510-ad64-c619264c000a', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
