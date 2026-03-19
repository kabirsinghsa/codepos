
-- Wash bay status tracking
CREATE TABLE public.wash_bay_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'washing', 'complete', 'error')),
  current_wash_type TEXT,
  current_code TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO public.wash_bay_status (id, status) VALUES (1, 'idle');

-- RLS
ALTER TABLE public.wash_bay_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all read" ON public.wash_bay_status FOR SELECT USING (true);
CREATE POLICY "Allow all update" ON public.wash_bay_status FOR UPDATE USING (true) WITH CHECK (true);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.wash_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wash_bay_status;
