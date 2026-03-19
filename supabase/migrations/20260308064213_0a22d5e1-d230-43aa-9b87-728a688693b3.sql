
-- Create wash type enum
CREATE TYPE public.wash_type AS ENUM ('basic', 'standard', 'premium', 'ultimate');

-- Create wash_codes table
CREATE TABLE public.wash_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  wash_type wash_type NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  plc_input INTEGER NOT NULL DEFAULT 1
);

-- Index for fast code lookups
CREATE INDEX idx_wash_codes_code ON public.wash_codes (code);
CREATE INDEX idx_wash_codes_expires_at ON public.wash_codes (expires_at);

-- Enable RLS (public access for now since no auth)
ALTER TABLE public.wash_codes ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth required for this kiosk app)
CREATE POLICY "Allow all read access" ON public.wash_codes FOR SELECT USING (true);
CREATE POLICY "Allow all insert access" ON public.wash_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access" ON public.wash_codes FOR UPDATE USING (true) WITH CHECK (true);
