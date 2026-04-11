
-- Function to get a user's site_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_site_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT site_id FROM public.profiles WHERE id = _user_id
$$;

-- Allow site_managers to update their own site
CREATE POLICY "Site managers can update own site"
ON public.sites
FOR UPDATE
TO authenticated
USING (
  id = public.get_user_site_id(auth.uid())
  AND public.has_role(auth.uid(), 'site_manager'::app_role)
)
WITH CHECK (
  id = public.get_user_site_id(auth.uid())
  AND public.has_role(auth.uid(), 'site_manager'::app_role)
);

-- Enable RLS on pos_inventory (fixing security warning)
ALTER TABLE public.pos_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read pos_inventory"
ON public.pos_inventory FOR SELECT TO authenticated
USING (is_approved(auth.uid()));

CREATE POLICY "Approved users can manage pos_inventory"
ON public.pos_inventory FOR ALL TO authenticated
USING (is_approved(auth.uid()))
WITH CHECK (is_approved(auth.uid()));
