-- SQL NOT IN behaves unexpectedly when provider_id is NULL:
-- auth.uid() NOT IN (customer_id, NULL) evaluates to NULL, not TRUE.
-- Use IS DISTINCT FROM so only the customer or the assigned provider can cancel.
CREATE OR REPLACE FUNCTION public.transition_service_request(
  _request_id uuid,
  _status public.request_status,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.service_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.service_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF _status = 'cancelled'::public.request_status THEN
    IF auth.uid() IS DISTINCT FROM v_request.customer_id
       AND auth.uid() IS DISTINCT FROM v_request.provider_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF v_request.status IN (
      'completed'::public.request_status,
      'cancelled'::public.request_status
    ) THEN
      RAISE EXCEPTION 'request_finished';
    END IF;

    UPDATE public.service_requests
    SET status = 'cancelled',
        cancellation_reason = NULLIF(trim(_reason), ''),
        cancelled_by = auth.uid()
    WHERE id = _request_id;

    DELETE FROM public.request_offers
    WHERE request_id = _request_id;

    RETURN true;
  END IF;

  IF v_request.provider_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status = 'in_progress'::public.request_status
     AND v_request.status = 'accepted'::public.request_status THEN
    UPDATE public.service_requests
    SET status = 'in_progress'
    WHERE id = _request_id;
    RETURN true;
  END IF;

  IF _status = 'completed'::public.request_status
     AND v_request.status = 'in_progress'::public.request_status THEN
    UPDATE public.service_requests
    SET status = 'completed',
        completed_at = now()
    WHERE id = _request_id;
    RETURN true;
  END IF;

  RAISE EXCEPTION 'invalid_status_transition';
END;
$$;

REVOKE ALL ON FUNCTION public.transition_service_request(uuid, public.request_status, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_service_request(uuid, public.request_status, text)
TO authenticated;
