-- Restrict live location writes and reads to the two participants of an active request.
DROP POLICY IF EXISTS "Users insert own location" ON public.live_locations;
DROP POLICY IF EXISTS "Users update own location" ON public.live_locations;
DROP POLICY IF EXISTS "Participants view request locations" ON public.live_locations;

CREATE POLICY "Participants view request locations"
ON public.live_locations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = live_locations.request_id
      AND (sr.customer_id = auth.uid() OR sr.provider_id = auth.uid())
  )
);

CREATE POLICY "Participants insert own active location"
ON public.live_locations FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = live_locations.request_id
      AND sr.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
      AND (
        (sr.customer_id = auth.uid() AND live_locations.role = 'customer')
        OR
        (sr.provider_id = auth.uid() AND live_locations.role = 'provider')
      )
  )
);

CREATE POLICY "Participants update own active location"
ON public.live_locations FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = live_locations.request_id
      AND sr.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
      AND (
        (sr.customer_id = auth.uid() AND live_locations.role = 'customer')
        OR
        (sr.provider_id = auth.uid() AND live_locations.role = 'provider')
      )
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = live_locations.request_id
      AND sr.status IN ('accepted'::public.request_status, 'in_progress'::public.request_status)
      AND (
        (sr.customer_id = auth.uid() AND live_locations.role = 'customer')
        OR
        (sr.provider_id = auth.uid() AND live_locations.role = 'provider')
      )
  )
);
