-- Remove permissive authenticated write policies.
-- Trusted server code and SECURITY DEFINER RPCs perform these system operations.
-- service_role bypasses RLS; ordinary authenticated clients must not mint
-- offers, chats, wallet balances, or financial ledger rows.

DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;
DROP POLICY IF EXISTS "System inserts chats" ON public.chats;
DROP POLICY IF EXISTS "System updates chats" ON public.chats;
DROP POLICY IF EXISTS "System inserts offers" ON public.request_offers;
DROP POLICY IF EXISTS "System inserts wallets" ON public.driver_wallets;
DROP POLICY IF EXISTS "System updates wallets" ON public.driver_wallets;
DROP POLICY IF EXISTS "System inserts transactions" ON public.transactions;

-- Intentionally no replacement client policy is added here. Server-side
-- service_role operations and owner-controlled SECURITY DEFINER functions
-- remain the only supported write paths for these system-managed records.
