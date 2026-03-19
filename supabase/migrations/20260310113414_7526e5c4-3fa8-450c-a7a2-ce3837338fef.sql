
-- Add vehicle_type column to wash_prices
ALTER TABLE public.wash_prices ADD COLUMN vehicle_type text NOT NULL DEFAULT 'small_medium';

-- Drop existing primary key
ALTER TABLE public.wash_prices DROP CONSTRAINT wash_prices_pkey;

-- Create new composite primary key
ALTER TABLE public.wash_prices ADD PRIMARY KEY (wash_type, vehicle_type);

-- Update existing rows to be small_medium (already default)
-- Insert bakkie_suv rows
INSERT INTO public.wash_prices (wash_type, vehicle_type, name, price, description) VALUES
  ('basic', 'bakkie_suv', 'Basic Wash', 100, 'Exterior rinse & dry'),
  ('standard', 'bakkie_suv', 'Standard Wash', 120, 'Soap, rinse & dry'),
  ('premium', 'bakkie_suv', 'Premium Wash', 150, 'Full wash with wax'),
  ('ultimate', 'bakkie_suv', 'Ultimate Wash', 200, 'Complete detail wash');

-- Insert quantum rows
INSERT INTO public.wash_prices (wash_type, vehicle_type, name, price, description) VALUES
  ('basic', 'quantum', 'Basic Wash', 120, 'Exterior rinse & dry'),
  ('standard', 'quantum', 'Standard Wash', 150, 'Soap, rinse & dry'),
  ('premium', 'quantum', 'Premium Wash', 180, 'Full wash with wax'),
  ('ultimate', 'quantum', 'Ultimate Wash', 250, 'Complete detail wash');
