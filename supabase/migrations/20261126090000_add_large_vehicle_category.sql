-- The vehicle onboarding catalog includes large passenger/cargo vehicles.
-- Extend the shared enum so the selected category can be stored without coercion.
ALTER TYPE public.vehicle_category ADD VALUE IF NOT EXISTS 'large';
