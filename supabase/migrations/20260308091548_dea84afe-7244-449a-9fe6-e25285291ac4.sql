-- Add approved column, default false for new signups
ALTER TABLE public.profiles ADD COLUMN approved boolean NOT NULL DEFAULT false;

-- Approve the existing user (you)
UPDATE public.profiles SET approved = true;

-- Update RLS: authenticated users need to be approved to access wash_codes
DROP POLICY IF EXISTS "Allow all read access" ON public.wash_codes;
DROP POLICY IF EXISTS "Allow all insert access" ON public.wash_codes;
DROP POLICY IF EXISTS "Allow all update access" ON public.wash_codes;

CREATE POLICY "Approved users can read wash_codes"
ON public.wash_codes FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
  OR auth.uid() IS NULL
);

CREATE POLICY "Approved users can insert wash_codes"
ON public.wash_codes FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
);

CREATE POLICY "Approved users can update wash_codes"
ON public.wash_codes FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
);

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
)
WITH CHECK (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved = true)
);