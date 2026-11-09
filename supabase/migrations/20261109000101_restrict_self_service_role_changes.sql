-- Users may select only the customer role directly.
-- Driver/worker roles must be granted through grant_provider_role_safe()
-- after the corresponding provider profile has been created.
DROP POLICY IF EXISTS "Users self-assign own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users update own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users delete own roles" ON public.user_roles;

CREATE POLICY "Users self-assign customer role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'customer'::public.app_role
  );

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
