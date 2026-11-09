-- Provider roles are not enough to receive jobs: an administrator must verify identity/vehicle first.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
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
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF TG_OP = 'INSERT' AND NEW.is_verified THEN
      RAISE EXCEPTION 'verification_admin_only';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.is_verified IS DISTINCT FROM OLD.is_verified
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
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF _provider_type = 'driver' THEN
    UPDATE public.driver_profiles
    SET is_verified = _verified,
        verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
        verified_by = CASE WHEN _verified THEN auth.uid() ELSE NULL END,
        available = false
    WHERE user_id = _provider_id;
  ELSIF _provider_type = 'worker' THEN
    UPDATE public.worker_profiles
    SET is_verified = _verified,
        verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
        verified_by = CASE WHEN _verified THEN auth.uid() ELSE NULL END,
        available = false
    WHERE user_id = _provider_id;
  ELSE
    RAISE EXCEPTION 'invalid_provider_type';
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'provider_profile_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_provider_verification(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_verification(uuid, text, boolean) TO authenticated;
