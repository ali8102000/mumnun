-- Live GPS coordinates are visible only while the related request is active.
-- Participants retain access to the request itself after completion, but not its live-location trail.
DROP POLICY IF EXISTS "Participants view request locations" ON public.live_locations;

CREATE POLICY "Participants view active request locations"
ON public.live_locations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = live_locations.request_id
      AND sr.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
      AND (sr.customer_id = auth.uid() OR sr.provider_id = auth.uid())
  )
);
