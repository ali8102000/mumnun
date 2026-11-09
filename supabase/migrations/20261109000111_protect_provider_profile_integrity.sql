-- Keep provider verification and reputation fields under administrative/system control.
CREATE OR REPLACE FUNCTION public.guard_driver_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $driver_profile_guard$
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 1 AND NOT public.has_admin_access(auth.uid()) THEN
    IF NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
      OR NEW.ratings_count IS DISTINCT FROM OLD.ratings_count
      OR NEW.completed_rides IS DISTINCT FROM OLD.completed_rides THEN
      RAISE EXCEPTION 'driver_stats_admin_only';
    END IF;

    IF OLD.is_verified AND (
      NEW.vehicle_category IS DISTINCT FROM OLD.vehicle_category
      OR NEW.vehicle_make IS DISTINCT FROM OLD.vehicle_make
      OR NEW.vehicle_model IS DISTINCT FROM OLD.vehicle_model
      OR NEW.vehicle_plate IS DISTINCT FROM OLD.vehicle_plate
      OR NEW.vehicle_year IS DISTINCT FROM OLD.vehicle_year
      OR NEW.vehicle_color IS DISTINCT FROM OLD.vehicle_color
    ) THEN
      RAISE EXCEPTION 'verified_vehicle_change_requires_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$driver_profile_guard$;

CREATE OR REPLACE FUNCTION public.guard_worker_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $worker_profile_guard$
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 1 AND NOT public.has_admin_access(auth.uid()) THEN
    IF NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
      OR NEW.ratings_count IS DISTINCT FROM OLD.ratings_count
      OR NEW.completed_jobs IS DISTINCT FROM OLD.completed_jobs THEN
      RAISE EXCEPTION 'worker_stats_admin_only';
    END IF;

    IF OLD.is_verified AND NEW.level IS DISTINCT FROM OLD.level THEN
      RAISE EXCEPTION 'verified_worker_level_change_requires_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$worker_profile_guard$;

DROP TRIGGER IF EXISTS guard_driver_profile_fields ON public.driver_profiles;
CREATE TRIGGER guard_driver_profile_fields
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_profile_fields();

DROP TRIGGER IF EXISTS guard_worker_profile_fields ON public.worker_profiles;
CREATE TRIGGER guard_worker_profile_fields
BEFORE UPDATE ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_worker_profile_fields();
