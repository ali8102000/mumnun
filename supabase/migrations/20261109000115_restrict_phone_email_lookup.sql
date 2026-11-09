-- Phone-to-email mapping is a server-only authentication detail.
-- Clients must never be able to enumerate email addresses from phone numbers.
REVOKE ALL ON FUNCTION public.lookup_email_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO service_role;
