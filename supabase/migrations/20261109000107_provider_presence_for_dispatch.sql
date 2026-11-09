-- Separate provider presence from per-request live tracking.
-- A provider must be verified and available before publishing a discoverable location.
CREATE TABLE IF NOT EXISTS public.provider_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('driver', 'worker')),
  lat numeric NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric NOT NULL CHECK (lng BETWEEN -180 AND 180),
  heading numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.provider_locations TO authenticated;
-- No SELECT policy is defined: direct reads still return no rows under RLS.
GRANT ALL ON TABLE public.provider_locations TO service_role;

CREATE POLICY "Verified available providers publish own presence"
ON public.provider_locations FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    (role = 'driver' AND public.has_role(auth.uid(), 'driver'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.driver_profiles dp
      WHERE dp.user_id = auth.uid() AND dp.available = true AND dp.is_verified = true
    ))
    OR
    (role = 'worker' AND public.has_role(auth.uid(), 'worker'::public.app_role) AND EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.user_id = auth.uid() AND wp.available = true AND wp.is_verified = true
    ))
  )
);

CREATE POLICY "Verified available providers update own presence"
ON public.provider_locations FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND (
    (role = 'driver' AND EXISTS (
      SELECT 1 FROM public.driver_profiles dp
      WHERE dp.user_id = auth.uid() AND dp.available = true AND dp.is_verified = true
    ))
    OR
    (role = 'worker' AND EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.user_id = auth.uid() AND wp.available = true AND wp.is_verified = true
    ))
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    (role = 'driver' AND EXISTS (
      SELECT 1 FROM public.driver_profiles dp
      WHERE dp.user_id = auth.uid() AND dp.available = true AND dp.is_verified = true
    ))
    OR
    (role = 'worker' AND EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.user_id = auth.uid() AND wp.available = true AND wp.is_verified = true
    ))
  )
);

CREATE INDEX IF NOT EXISTS idx_provider_locations_updated_at
  ON public.provider_locations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_locations_geo
  ON public.provider_locations(lat, lng);

-- Ignore client-supplied timestamps and reject physically implausible jumps.
CREATE OR REPLACE FUNCTION public.guard_provider_location_speed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  previous_location record;
  distance_km numeric;
  elapsed_seconds numeric;
  speed_kmh numeric;
BEGIN
  SELECT lat, lng, updated_at
  INTO previous_location
  FROM public.provider_locations
  WHERE user_id = NEW.user_id;

  IF FOUND THEN
    elapsed_seconds := GREATEST(1, EXTRACT(EPOCH FROM (now() - previous_location.updated_at)));
    distance_km := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(previous_location.lat)) * cos(radians(NEW.lat)) *
      cos(radians(NEW.lng) - radians(previous_location.lng)) +
      sin(radians(previous_location.lat)) * sin(radians(NEW.lat))
    )));
    speed_kmh := (distance_km / elapsed_seconds) * 3600;
    IF speed_kmh > 250 THEN
      RAISE EXCEPTION 'implausible_provider_location_speed';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS trg_guard_provider_location_speed ON public.provider_locations;
CREATE TRIGGER trg_guard_provider_location_speed
BEFORE INSERT OR UPDATE ON public.provider_locations
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_location_speed();

-- Nearby taxi matching now reads provider presence, not a location row tied to an old request.
CREATE OR REPLACE FUNCTION public.find_nearby_drivers(
  _lat numeric,
  _lng numeric,
  _category text,
  _radius_km numeric DEFAULT 5,
  _limit int DEFAULT 10
)
RETURNS TABLE(user_id uuid, distance_km numeric, rating_avg numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.user_id,
    (
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(pl.lat)) *
        cos(radians(pl.lng) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(pl.lat))
      )))
    )::numeric AS distance_km,
    dp.rating_avg
  FROM public.driver_profiles dp
  JOIN public.provider_locations pl ON pl.user_id = dp.user_id
  WHERE dp.available = true
    AND dp.is_verified = true
    AND public.has_role(dp.user_id, 'driver'::public.app_role)
    AND pl.role = 'driver'
    AND dp.vehicle_category::text = _category
    AND pl.updated_at > now() - interval '90 seconds'
    AND (
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(pl.lat)) *
        cos(radians(pl.lng) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(pl.lat))
      )))
    ) <= _radius_km
    AND NOT EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.provider_id = dp.user_id
        AND sr.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
    )
  ORDER BY distance_km ASC, dp.rating_avg DESC NULLS LAST
  LIMIT _limit;
$$;

REVOKE EXECUTE ON FUNCTION public.find_nearby_drivers(numeric, numeric, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;

-- Nearby map pins expose anonymized locations only through this bounded RPC.
CREATE OR REPLACE FUNCTION public.find_nearby_provider_pins(
  _lat numeric,
  _lng numeric,
  _type text,
  _category text DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _radius_km numeric DEFAULT 5,
  _limit int DEFAULT 30
)
RETURNS TABLE(pin_id text, lat numeric, lng numeric, heading numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    md5(pl.user_id::text) AS pin_id,
    pl.lat,
    pl.lng,
    pl.heading
  FROM public.provider_locations pl
  WHERE pl.updated_at > now() - interval '90 seconds'
    AND (
      (_type = 'taxi' AND pl.role = 'driver' AND EXISTS (
        SELECT 1 FROM public.driver_profiles dp
        WHERE dp.user_id = pl.user_id
          AND dp.available = true
          AND dp.is_verified = true
          AND public.has_role(dp.user_id, 'driver'::public.app_role)
          AND (_category IS NULL OR dp.vehicle_category::text = _category)
      ))
      OR
      (_type = 'service' AND pl.role = 'worker' AND EXISTS (
        SELECT 1 FROM public.worker_profiles wp
        WHERE wp.user_id = pl.user_id
          AND wp.available = true
          AND wp.is_verified = true
          AND public.has_role(wp.user_id, 'worker'::public.app_role)
          AND (
            _service_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.worker_services ws
              WHERE ws.worker_id = wp.user_id AND ws.service_id = _service_id
            )
          )
      ))
    )
    AND (
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(_lat)) * cos(radians(pl.lat)) *
        cos(radians(pl.lng) - radians(_lng)) +
        sin(radians(_lat)) * sin(radians(pl.lat))
      )))
    ) <= LEAST(GREATEST(COALESCE(_radius_km, 5), 0), 20)
  ORDER BY pl.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.find_nearby_provider_pins(numeric, numeric, text, text, uuid, numeric, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_provider_pins(numeric, numeric, text, text, uuid, numeric, integer)
  TO authenticated;
