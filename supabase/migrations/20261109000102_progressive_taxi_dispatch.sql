-- Progressive dispatch: offer to the closest available drivers first.
-- The request row lock and 45-second offer lifetime remain authoritative.
CREATE OR REPLACE FUNCTION public.dispatch_request(_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_count integer := 0;
  v_radius integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_request
  FROM public.service_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF v_request.type <> 'taxi'::public.request_type THEN
    RETURN 0;
  END IF;
  IF v_request.pickup_lat IS NULL OR v_request.pickup_lng IS NULL THEN
    RAISE EXCEPTION 'pickup_location_required';
  END IF;
  IF v_request.status NOT IN ('pending'::public.request_status, 'searching'::public.request_status) THEN
    RAISE EXCEPTION 'invalid_request_status';
  END IF;

  UPDATE public.service_requests
  SET status = 'searching', searching_started_at = now()
  WHERE id = _request_id;

  DELETE FROM public.request_offers
  WHERE request_id = _request_id AND status = 'pending';

  FOREACH v_radius IN ARRAY ARRAY[2, 5, 10]
  LOOP
    INSERT INTO public.request_offers (request_id, provider_id, distance_km, status, expires_at)
    SELECT
      _request_id,
      d.user_id,
      d.distance_km,
      'pending',
      now() + interval '45 seconds'
    FROM public.find_nearby_drivers(
      v_request.pickup_lat,
      v_request.pickup_lng,
      COALESCE(v_request.vehicle_category::text, 'economy'),
      v_radius,
      10
    ) d
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    EXIT WHEN v_count > 0;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_request(uuid) TO authenticated;
