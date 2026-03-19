-- Add multi-wash columns
ALTER TABLE public.wash_codes
  ADD COLUMN total_washes integer NOT NULL DEFAULT 1,
  ADD COLUMN washes_used integer NOT NULL DEFAULT 0;