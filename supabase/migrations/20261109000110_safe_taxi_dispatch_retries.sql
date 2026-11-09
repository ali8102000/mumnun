-- Make taxi dispatch retries safe, idempotent and able to re-offer after expiry.
CREATE OR REPLACE FUNCTION public.dispatch_request(_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $dispatch_retry$
DECLARE
  v_request public.service_requests%ROWTYPE;
  v_count integer := 0;
  v_radius integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));

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

  SELECT count(*) INTO v_count
  FROM public.request_offers
  WHERE request_id = _request_id
    AND status = 'pending'
    AND expires_at > now();

  -- An active offer batch already exists; do not spam the same providers.
  IF v_count > 0 THEN
    RETURN v_count;
  END IF;

  UPDATE public.request_offers
  SET status = 'expired', responded_at = now()
  WHERE request_id = _request_id
    AND status = 'pending'
    AND expires_at <= now();

  UPDATE public.service_requests
  SET status = 'searching', searching_started_at = now()
  WHERE id = _request_id;

  FOREACH v_radius IN ARRAY ARRAY[2, 5, 10]
  LOOP
    INSERT INTO public.request_offers (
      request_id, provider_id, distance_km, status, sent_at, expires_at, responded_at
    )
    SELECT
      _request_id,
      d.user_id,
      d.distance_km,
      'pending',
      now(),
      now() + interval '45 seconds',
      NULL
    FROM public.find_nearby_drivers(
      v_request.pickup_lat,
      v_request.pickup_lng,
      COALESCE(v_request.vehicle_category::text, 'economy'),
      v_radius,
      10
    ) d
    ON CONFLICT (request_id, provider_id) DO UPDATE
      SET distance_km = EXCLUDED.distance_km,
          status = 'pending',
          sent_at = now(),
          expires_at = now() + interval '45 seconds',
          responded_at = NULL
      WHERE public.request_offers.status IN ('expired', 'rejected', 'cancelled');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    EXIT WHEN v_count > 0;
  END LOOP;

  RETURN v_count;
END;
$dispatch_retry$;

REVOKE ALL ON FUNCTION public.dispatch_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_request(uuid) TO authenticated;
