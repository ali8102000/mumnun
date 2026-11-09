-- Workers see only fresh, nearby service requests matching their enabled service.
CREATE OR REPLACE FUNCTION public.worker_is_near_service_request(_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_requests sr
    JOIN public.provider_locations pl ON pl.user_id = auth.uid()
    JOIN public.worker_profiles wp ON wp.user_id = auth.uid()
    WHERE sr.id = _request_id
      AND sr.type = 'service'::public.request_type
      AND sr.status IN ('pending'::public.request_status, 'searching'::public.request_status)
      AND public.has_role(auth.uid(), 'worker'::public.app_role)
      AND wp.available = true
      AND wp.is_verified = true
      AND pl.role = 'worker'
      AND pl.updated_at > now() - interval '90 seconds'
      AND (
        6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(sr.pickup_lat)) * cos(radians(pl.lat)) *
          cos(radians(pl.lng) - radians(sr.pickup_lng)) +
          sin(radians(sr.pickup_lat)) * sin(radians(pl.lat))
        )))
      ) <= 10
      AND NOT EXISTS (
        SELECT 1 FROM public.service_requests active_request
        WHERE active_request.provider_id = auth.uid()
          AND active_request.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
      )
      AND (
        sr.service_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.worker_services ws
          WHERE ws.worker_id = auth.uid() AND ws.service_id = sr.service_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.worker_is_near_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_is_near_service_request(uuid) TO authenticated;

DROP POLICY IF EXISTS "Workers see available service requests" ON public.service_requests;
CREATE POLICY "Workers see nearby verified service requests"
ON public.service_requests FOR SELECT TO authenticated
USING (
  type = 'service'::public.request_type
  AND status IN ('pending'::public.request_status, 'searching'::public.request_status)
  AND public.worker_is_near_service_request(id)
);

-- Acceptance is atomic and rechecks provider verification, freshness, proximity and service match.
CREATE OR REPLACE FUNCTION public.accept_service_request(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'driver'::public.app_role)
       OR public.has_role(auth.uid(), 'worker'::public.app_role)) THEN
    RAISE EXCEPTION 'provider_role_required';
  END IF;

  -- Serialize accepts per provider so concurrent requests cannot assign two active jobs.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  UPDATE public.service_requests sr
  SET provider_id = auth.uid(), status = 'accepted', accepted_at = now()
  WHERE sr.id = _request_id
    AND (
      (
        sr.type = 'taxi'::public.request_type
        AND sr.status = 'searching'::public.request_status
        AND public.has_role(auth.uid(), 'driver'::public.app_role)
        AND EXISTS (
          SELECT 1 FROM public.driver_profiles dp
          WHERE dp.user_id = auth.uid()
            AND dp.available = true
            AND dp.is_verified = true
        )
        AND EXISTS (
          SELECT 1 FROM public.provider_locations pl
          WHERE pl.user_id = auth.uid()
            AND pl.role = 'driver'
            AND pl.updated_at > now() - interval '90 seconds'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.service_requests active_request
          WHERE active_request.provider_id = auth.uid()
            AND active_request.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
        )
        AND EXISTS (
          SELECT 1 FROM public.request_offers o
          WHERE o.request_id = _request_id
            AND o.provider_id = auth.uid()
            AND o.status = 'pending'
            AND o.expires_at > now()
        )
      )
      OR
      (
        sr.type = 'service'::public.request_type
        AND sr.status IN ('pending'::public.request_status, 'searching'::public.request_status)
        AND public.worker_is_near_service_request(_request_id)
      )
    )
  RETURNING sr.customer_id INTO v_customer;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'request_unavailable';
  END IF;

  INSERT INTO public.chats (request_id, customer_id, provider_id)
  VALUES (_request_id, v_customer, auth.uid())
  ON CONFLICT DO NOTHING;

  UPDATE public.request_offers
  SET status = 'accepted', responded_at = now()
  WHERE request_id = _request_id
    AND provider_id = auth.uid()
    AND status = 'pending';

  UPDATE public.request_offers
  SET status = 'cancelled', responded_at = now()
  WHERE request_id = _request_id
    AND provider_id <> auth.uid()
    AND status = 'pending';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_request(uuid) TO authenticated;
