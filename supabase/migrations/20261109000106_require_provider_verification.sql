-- Provider roles are not enough to receive jobs: an administrator must verify identity/vehicle first.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'suspended', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'suspended', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.guard_provider_verification_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_admin_access(auth.uid()) THEN
    IF TG_OP = 'INSERT' AND (
      NEW.is_verified
      OR NEW.verification_status <> 'pending'
      OR NEW.verified_at IS NOT NULL
      OR NEW.verified_by IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'verification_admin_only';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.is_verified IS DISTINCT FROM OLD.is_verified
      OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
    ) THEN
      RAISE EXCEPTION 'verification_admin_only';
    END IF;
  END IF;

  IF NEW.available AND NOT NEW.is_verified THEN
    RAISE EXCEPTION 'provider_not_verified';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_driver_verification_fields ON public.driver_profiles;
CREATE TRIGGER guard_driver_verification_fields
BEFORE INSERT OR UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_verification_fields();

DROP TRIGGER IF EXISTS guard_worker_verification_fields ON public.worker_profiles;
CREATE TRIGGER guard_worker_verification_fields
BEFORE INSERT OR UPDATE ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_verification_fields();

CREATE OR REPLACE FUNCTION public.admin_set_provider_status(
  p_user_id uuid,
  p_type text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_access(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_status NOT IN ('approved', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'invalid_provider_status';
  END IF;

  IF p_type = 'driver' THEN
    UPDATE public.driver_profiles
    SET verification_status = p_status,
        is_verified = (p_status = 'approved'),
        verified_at = CASE WHEN p_status = 'approved' THEN now() ELSE NULL END,
        verified_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE NULL END,
        available = false
    WHERE user_id = p_user_id;
  ELSIF p_type = 'worker' THEN
    UPDATE public.worker_profiles
    SET verification_status = p_status,
        is_verified = (p_status = 'approved'),
        verified_at = CASE WHEN p_status = 'approved' THEN now() ELSE NULL END,
        verified_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE NULL END,
        available = false
    WHERE user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'invalid_provider_type';
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'provider_profile_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_provider_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_status(uuid, text, text) TO authenticated;

-- Backward-compatible boolean API; it uses the same admin authorization.
CREATE OR REPLACE FUNCTION public.admin_set_provider_verification(
  _provider_id uuid,
  _provider_type text,
  _verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_set_provider_status(
    _provider_id,
    _provider_type,
    CASE WHEN _verified THEN 'approved' ELSE 'rejected' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_provider_verification(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_verification(uuid, text, boolean) TO authenticated;
