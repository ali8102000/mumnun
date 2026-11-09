-- Support per-customer taxi request rate limiting and request history lookups.
CREATE INDEX IF NOT EXISTS idx_service_requests_customer_type_created
  ON public.service_requests(customer_id, type, created_at DESC);
