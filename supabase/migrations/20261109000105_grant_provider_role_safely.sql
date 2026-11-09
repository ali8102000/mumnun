-- Safely grant provider roles only after the authenticated user has a matching profile.
-- This RPC replaces direct self-inserts into user_roles.
CREATE OR REPLACE FUNCTION public.grant_provider_role_safe(_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _role = 'driver'::public.app_role THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.driver_profiles dp WHERE dp.user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'driver_profile_required';
    END IF;
  ELSIF _role = 'worker'::public.app_role THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'worker_profile_required';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_provider_role';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_provider_role_safe(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_provider_role_safe(public.app_role) TO authenticated;
