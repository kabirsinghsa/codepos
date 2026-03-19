
-- Add INSERT policy for profiles so the trigger can work
CREATE POLICY "Allow trigger insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Also allow service role / trigger inserts
CREATE POLICY "Allow service insert profiles"
ON public.profiles
FOR INSERT
TO service_role
WITH CHECK (true);

-- Force insert the admin profile bypassing RLS
INSERT INTO public.profiles (id, display_name, approved)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', 'Kabir'), true
FROM auth.users
WHERE email = 'kabir@ges.co.za'
ON CONFLICT (id) DO UPDATE SET approved = true, display_name = 'Kabir';
