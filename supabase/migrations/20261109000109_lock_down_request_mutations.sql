-- All state transitions and offer responses must use guarded SECURITY DEFINER RPCs.
-- Do not let clients directly claim, cancel, reprice, or rewrite requests/offers.

DROP POLICY IF EXISTS "Customer updates own request" ON public.service_requests;
DROP POLICY IF EXISTS "Provider updates assigned or accepts pending" ON public.service_requests;
DROP POLICY IF EXISTS "Provider updates own offer" ON public.request_offers;

-- Customers may still create home-service requests from the client.
-- Taxi creation is server-only so route distance and fare cannot be client-forged.
DROP POLICY IF EXISTS "Customer creates own requests" ON public.service_requests;
CREATE POLICY "Customers create own home service requests"
ON public.service_requests FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = customer_id
  AND type = 'service'::public.request_type
  AND status = 'pending'::public.request_status
  AND provider_id IS NULL
  AND accepted_at IS NULL
  AND completed_at IS NULL
  AND cancelled_by IS NULL
  AND commission IS NULL
  AND service_id IS NOT NULL
  AND pickup_lat BETWEEN -90 AND 90
  AND pickup_lng BETWEEN -180 AND 180
  AND workers_count BETWEEN 1 AND 20
  AND (
    (pricing_mode = 'negotiable' AND customer_price IS NULL)
    OR (
      pricing_mode IN ('fixed', 'hourly')
      AND customer_price > 0
      AND mod(customer_price, 250) = 0
      AND (pricing_mode <> 'hourly' OR work_hours > 0)
    )
  )
);

-- Request transitions are performed by transition_service_request().
-- Taxi creation is performed by the authenticated server function after
-- recalculating road distance and fare with the trusted routing provider.
