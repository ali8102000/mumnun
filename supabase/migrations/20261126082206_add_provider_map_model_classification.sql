alter table public.driver_profiles
  add column if not exists map_model_type text not null default 'taxi';

update public.driver_profiles
set map_model_type = case
  when coalesce(vehicle_model, '') ilike '%حمل%'
    or coalesce(vehicle_type, '') ilike '%cargo%'
    or coalesce(vehicle_type, '') ilike '%حمل%' then 'cargo_van'
  when coalesce(vehicle_model, '') ilike '%ركاب%'
    or coalesce(vehicle_type, '') ilike '%passenger%'
    or coalesce(vehicle_type, '') ilike '%ركاب%' then 'passenger_van'
  when coalesce(vehicle_model, '') ilike '%باص%'
    or coalesce(vehicle_type, '') ilike '%bus%'
    or coalesce(vehicle_type, '') ilike '%باص%' then 'bus'
  else 'taxi'
end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'driver_profiles_map_model_type_check'
      and conrelid = 'public.driver_profiles'::regclass
  ) then
    alter table public.driver_profiles
      add constraint driver_profiles_map_model_type_check
      check (map_model_type in ('taxi','cargo_van','passenger_van','bus'));
  end if;
end $$;

create or replace function public.find_nearby_provider_map_pins(
  _lat numeric,
  _lng numeric,
  _type text,
  _category text default null,
  _service_id uuid default null,
  _radius_km numeric default 5,
  _limit integer default 30
)
returns table(pin_id text, lat numeric, lng numeric, heading numeric, model_type text)
language sql
stable
security definer
set search_path = public
as $function$
  with origin as (
    select extensions.st_setsrid(
      extensions.st_makepoint(_lng::double precision, _lat::double precision), 4326
    )::extensions.geography as point
  )
  select
    md5(pp.user_id::text),
    round(pp.lat::numeric, 3),
    round(pp.lng::numeric, 3),
    pp.heading::numeric,
    case when _type = 'service' then 'worker' else coalesce(dp.map_model_type, 'taxi') end
  from public.provider_presence pp
  cross join origin o
  left join public.driver_profiles dp
    on dp.user_id = pp.user_id and _type = 'taxi'
  where auth.uid() is not null
    and _lat between -90 and 90 and _lng between -180 and 180
    and _type in ('taxi', 'service')
    and pp.updated_at > now() - interval '5 minutes'
    and extensions.st_dwithin(
      pp.location, o.point,
      (least(greatest(coalesce(_radius_km, 5), 0.1), 25) * 1000 * 1.01) + 5
    )
    and (
      (
        _type = 'taxi'
        and exists (
          select 1 from public.driver_profiles driver_check
          where driver_check.user_id = pp.user_id
            and driver_check.available = true
            and driver_check.status = 'approved'
            and (driver_check.suspended_until is null or driver_check.suspended_until <= now())
            and (_category is null or driver_check.vehicle_category::text = _category)
            and (
              (_category = 'large' and exists (
                select 1 from public.user_roles role_large
                where role_large.user_id = driver_check.user_id
                  and role_large.role = 'large_driver'::public.app_role
              ))
              or (_category is distinct from 'large' and exists (
                select 1 from public.user_roles role_driver
                where role_driver.user_id = driver_check.user_id
                  and role_driver.role = 'driver'::public.app_role
              ))
            )
        )
      )
      or
      (
        _type = 'service'
        and exists (
          select 1 from public.user_roles role_worker
          where role_worker.user_id = pp.user_id
            and role_worker.role = 'worker'::public.app_role
        )
        and exists (
          select 1 from public.worker_profiles wp
          where wp.user_id = pp.user_id
            and wp.available = true
            and wp.status = 'approved'
            and (wp.suspended_until is null or wp.suspended_until <= now())
            and (
              _service_id is null
              or exists (
                select 1 from public.worker_services ws
                where ws.worker_id = wp.user_id and ws.service_id = _service_id
              )
            )
        )
      )
    )
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(_lat::double precision)) * cos(radians(pp.lat)) *
      cos(radians(pp.lng) - radians(_lng::double precision)) +
      sin(radians(_lat::double precision)) * sin(radians(pp.lat))
    ))) <= least(greatest(coalesce(_radius_km, 5), 0.1), 25)
  order by pp.updated_at desc
  limit least(greatest(coalesce(_limit, 30), 1), 30);
$function$;

revoke all on function public.find_nearby_provider_map_pins(numeric,numeric,text,text,uuid,numeric,integer)
  from public, anon;
grant execute on function public.find_nearby_provider_map_pins(numeric,numeric,text,text,uuid,numeric,integer)
  to authenticated;