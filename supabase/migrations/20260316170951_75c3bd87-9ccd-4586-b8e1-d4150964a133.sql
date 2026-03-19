
ALTER TABLE public.wash_codes 
ADD COLUMN vehicle_type text NOT NULL DEFAULT 'small_medium',
ADD COLUMN selected_extras jsonb NOT NULL DEFAULT '[]'::jsonb;
