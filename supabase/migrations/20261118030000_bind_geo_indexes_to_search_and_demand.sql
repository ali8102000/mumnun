begin;

-- Add a spatial column/index for the second live-location source used by discovery.
alter table public.live_locations
  add column if not exists location extensions.geography(Point, 4326)
  generated always as (
    extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography
  ) stored;

create index if not exists idx_live_locations_location_gist
  on public.live_locations using gist (location);

-- Provider map pins: GiST prefilter first, retain the original Haversine boundary check.
create or replace function public.find_nearby_provider_pins(
  _lat numeric, _lng numeric, _type text,
  _category text default null::text,
  _service_id uuid default null::uuid,
  _radius_km numeric default 5,
  _limit integer default 30
)
returns table(pin_id text, lat numeric, lng numeric, heading numeric)
language sql stable security definer
set search_path to 'public'
as $function$
  with origin as (
    select extensions.st_setsrid(
      extensions.st_makepoint(_lng::double precision, _lat::double precision), 4326
    )::extensions.geography as point
  )
  select md5(pp.user_id::text), round(pp.lat::numeric, 3),
         round(pp.lng::numeric, 3), pp.heading::numeric
  from public.provider_presence pp
  cross join origin o
  where auth.uid() is not null
    and _lat between -90 and 90 and _lng between -180 and 180
    and _type in ('taxi', 'service')
    and pp.updated_at > now() - interval '5 minutes'
    and extensions.st_dwithin(
      pp.location, o.point,
      (least(greatest(coalesce(_radius_km, 5), 0.1), 25) * 1000 * 1.01) + 5
    )
    and public.mamnoon_provider_subscription_active_internal(pp.user_id)
    and (
      (
        _type = 'taxi'
        and exists (
          select 1 from public.driver_profiles dp
          where dp.user_id = pp.user_id and dp.available = true
            and dp.status = 'approved'
            and (dp.suspended_until is null or dp.suspended_until <= now())
            and (_category is null or dp.vehicle_category::text = _category)
            and (
              (_category = 'large' and public.has_role(dp.user_id, 'large_driver'::public.app_role))
              or (_category is distinct from 'large'
                and public.has_role(dp.user_id, 'driver'::public.app_role))
            )
        )
      )
      or
      (
        _type = 'service'
        and public.has_role(pp.user_id, 'worker'::public.app_role)
        and exists (
          select 1 from public.worker_profiles wp
          where wp.user_id = pp.user_id and wp.available = true
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

-- Dispatch discovery: spatially shortlist candidates, then select each user's true latest
-- location across both sources before applying the original eligibility and distance rules.
create or replace function public.find_nearby_drivers(
  _lat numeric, _lng numeric, _category text,
  _radius_km numeric default 5, _limit integer default 10
)
returns table(user_id uuid, distance_km numeric, rating_avg numeric)
language sql stable security definer
set search_path to 'public'
as $function$
  with origin as (
    select extensions.st_setsrid(
      extensions.st_makepoint(_lng::double precision, _lat::double precision), 4326
    )::extensions.geography as point
  ),
  candidate_users as materialized (
    select pp.user_id
    from public.provider_presence pp cross join origin o
    where pp.updated_at > now() - interval '5 minutes'
      and extensions.st_dwithin(pp.location, o.point,
        (least(greatest(coalesce(_radius_km, 5), 0.1), 55) * 1000 * 1.01) + 5)
    union
    select ll.user_id
    from public.live_locations ll cross join origin o
    where ll.updated_at > now() - interval '5 minutes'
      and extensions.st_dwithin(ll.location, o.point,
        (least(greatest(coalesce(_radius_km, 5), 0.1), 55) * 1000 * 1.01) + 5)
  ),
  locations as (
    select pp.user_id, pp.lat, pp.lng, pp.updated_at
    from public.provider_presence pp join candidate_users c on c.user_id = pp.user_id
    union all
    select ll.user_id, ll.lat, ll.lng, ll.updated_at
    from public.live_locations ll join candidate_users c on c.user_id = ll.user_id
  ),
  latest as materialized (
    select distinct on (user_id) user_id, lat, lng, updated_at
    from locations order by user_id, updated_at desc
  ),
  ranked as (
    select distinct on (dp.user_id)
      dp.user_id, dp.rating_avg, coalesce(sp.priority_weight, 0) as subscription_priority,
      (6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(_lat::double precision)) * cos(radians(loc.lat)) *
        cos(radians(loc.lng) - radians(_lng::double precision)) +
        sin(radians(_lat::double precision)) * sin(radians(loc.lat))
      ))))::numeric as distance_km
    from public.driver_profiles dp
    join latest loc on loc.user_id = dp.user_id
    left join public.user_subscriptions us on us.user_id = dp.user_id
      and us.status = 'active'
      and (us.current_period_end is null or us.current_period_end > now())
    left join public.subscription_plans sp on sp.id = us.plan_id
    where dp.available = true
      and public.mamnoon_provider_subscription_active_internal(dp.user_id)
      and dp.status = 'approved'
      and (dp.suspended_until is null or dp.suspended_until <= now())
      and (_category is null or dp.vehicle_category::text = _category)
      and (
        (_category = 'large' and exists (
          select 1 from public.user_roles ur
          where ur.user_id = dp.user_id and ur.role = 'large_driver'::public.app_role
        ))
        or (_category is distinct from 'large' and _category in ('economy', 'premium', 'luxury')
          and exists (
            select 1 from public.user_roles ur
            where ur.user_id = dp.user_id and ur.role = 'driver'::public.app_role
          ))
      )
      and loc.updated_at > now() - interval '5 minutes'
      and not exists (
        select 1 from public.service_requests sr
        where sr.provider_id = dp.user_id and sr.status in ('accepted', 'in_progress')
      )
      and not exists (
        select 1 from public.user_blocks b
        where b.user_id = dp.user_id and (b.expires_at is null or b.expires_at > now())
      )
    order by dp.user_id, loc.updated_at desc
  )
  select x.user_id, x.distance_km, x.rating_avg
  from ranked x
  where x.distance_km <= least(greatest(coalesce(_radius_km, 5), 0.1), 55)
    and (
      _category is distinct from 'large'
      or x.distance_km <= coalesce((
        select least(coalesce(dp.service_radius_km, 25),
          case coalesce(sp2.code, 'bronze')
            when 'gold' then 55 when 'silver' then 40 else 25
          end)
        from public.driver_profiles dp
        left join public.user_subscriptions us2 on us2.user_id = dp.user_id
          and us2.status = 'active'
          and (us2.current_period_end is null or us2.current_period_end > now())
        left join public.subscription_plans sp2 on sp2.id = us2.plan_id
        where dp.user_id = x.user_id
      ), 25)
    )
  order by x.subscription_priority desc, x.distance_km asc, x.rating_avg desc nulls last
  limit least(greatest(coalesce(_limit, 10), 1), 1000);
$function$;

-- Dynamic taxi-demand factor: use GiST for nearby drivers and nearby waiting trips,
-- while retaining the existing exact distance threshold and multiplier tiers.
create or replace function public.get_taxi_demand_multiplier(
  _lat numeric, _lng numeric, _category text default null::text
)
returns numeric
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_drivers integer := 0;
  v_waiting integer := 0;
  v_ratio numeric;
  v_origin extensions.geography;
begin
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'موقع الانطلاق غير صالح';
  end if;
  if _category is not null and _category not in ('economy','premium','luxury') then
    raise exception 'فئة السيارة غير صالحة';
  end if;

  v_origin := extensions.st_setsrid(
    extensions.st_makepoint(_lng::double precision, _lat::double precision), 4326
  )::extensions.geography;

  with candidate_users as materialized (
    select pp.user_id from public.provider_presence pp
    where pp.updated_at > now() - interval '5 minutes'
      and extensions.st_dwithin(pp.location, v_origin, 5055)
    union
    select ll.user_id from public.live_locations ll
    where ll.role = 'provider'
      and ll.updated_at > now() - interval '5 minutes'
      and extensions.st_dwithin(ll.location, v_origin, 5055)
  ),
  locations as (
    select pp.user_id, pp.lat, pp.lng, pp.updated_at
    from public.provider_presence pp join candidate_users c on c.user_id = pp.user_id
    union all
    select ll.user_id, ll.lat, ll.lng, ll.updated_at
    from public.live_locations ll join candidate_users c on c.user_id = ll.user_id
    where ll.role = 'provider'
  ),
  latest as materialized (
    select distinct on (user_id) user_id, lat, lng, updated_at
    from locations order by user_id, updated_at desc
  )
  select count(*)::integer into v_drivers
  from public.driver_profiles dp
  join latest loc on loc.user_id = dp.user_id
  where dp.available and dp.status = 'approved'
    and (_category is null or dp.vehicle_category::text = _category)
    and loc.updated_at > now() - interval '5 minutes'
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(_lat::double precision)) * cos(radians(loc.lat)) *
      cos(radians(loc.lng) - radians(_lng::double precision)) +
      sin(radians(_lat::double precision)) * sin(radians(loc.lat))
    ))) <= 5
    and not exists (
      select 1 from public.service_requests active
      where active.provider_id = dp.user_id and active.status in ('accepted','in_progress')
    )
    and not exists (
      select 1 from public.user_blocks b
      where b.user_id = dp.user_id and (b.expires_at is null or b.expires_at > now())
    );

  select count(*)::integer into v_waiting
  from public.service_requests sr
  where sr.type = 'taxi'
    and sr.status in ('pending','searching')
    and sr.provider_id is null
    and sr.created_at > now() - interval '15 minutes'
    and (_category is null or sr.vehicle_category::text = _category)
    and sr.pickup_location is not null
    and extensions.st_dwithin(sr.pickup_location, v_origin, 5055)
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(_lat::double precision)) * cos(radians(sr.pickup_lat::double precision)) *
      cos(radians(sr.pickup_lng::double precision) - radians(_lng::double precision)) +
      sin(radians(_lat::double precision)) * sin(radians(sr.pickup_lat::double precision))
    ))) <= 5;

  v_ratio := v_drivers::numeric / greatest(v_waiting + 1, 1);
  if v_ratio >= 3 then return 0.80;
  elsif v_ratio >= 2 then return 0.90;
  elsif v_ratio >= 1.25 then return 1.00;
  elsif v_ratio >= 0.75 then return 1.10;
  elsif v_ratio >= 0.50 then return 1.25;
  elsif v_ratio >= 0.25 then return 1.40;
  else return 1.50;
  end if;
end;
$function$;

-- Nearby-demand notification trigger uses the same indexed geography prefilter.
create or replace function public.notify_taxi_drivers_on_new_demand()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_zone text;
  v_waiting integer;
  v_origin extensions.geography;
begin
  if new.type <> 'taxi' or new.status not in ('pending','searching')
     or new.pickup_lat is null or new.pickup_lng is null then
    return new;
  end if;

  v_origin := extensions.st_setsrid(
    extensions.st_makepoint(new.pickup_lng::double precision, new.pickup_lat::double precision), 4326
  )::extensions.geography;

  select count(*)::integer into v_waiting
  from public.service_requests sr
  where sr.type = 'taxi'
    and sr.status in ('pending','searching')
    and sr.created_at > now() - interval '30 minutes'
    and sr.pickup_location is not null
    and extensions.st_dwithin(sr.pickup_location, v_origin, 2025)
    and 6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(new.pickup_lat::double precision)) * cos(radians(sr.pickup_lat::double precision)) *
      cos(radians(sr.pickup_lng::double precision) - radians(new.pickup_lng::double precision)) +
      sin(radians(new.pickup_lat::double precision)) * sin(radians(sr.pickup_lat::double precision))
    ))) <= 2;

  if v_waiting < 2 then return new; end if;
  v_zone := floor(new.pickup_lat::numeric * 100)::text || ':' ||
            floor(new.pickup_lng::numeric * 100)::text;

  with eligible as (
    select dp.user_id, sp.code as plan_code
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id = dp.user_id and ur.role = 'driver'
    join public.provider_presence pp on pp.user_id = dp.user_id
      and pp.updated_at > now() - interval '5 minutes'
    join public.user_subscriptions us on us.user_id = dp.user_id
      and us.status = 'active'
      and (us.current_period_end is null or us.current_period_end > now())
    join public.subscription_plans sp on sp.id = us.plan_id and sp.code in ('silver','gold')
    where dp.available = true and dp.status = 'approved'
      and extensions.st_dwithin(pp.location, v_origin, 2025)
      and 6371 * acos(least(1.0, greatest(-1.0,
        cos(radians(new.pickup_lat::double precision)) * cos(radians(pp.lat)) *
        cos(radians(pp.lng) - radians(new.pickup_lng::double precision)) +
        sin(radians(new.pickup_lat::double precision)) * sin(radians(pp.lat))
      ))) <= 2
  ),
  logged as (
    insert into public.provider_demand_alert_log(user_id, zone_key, last_notified_at)
    select e.user_id, v_zone, now() from eligible e
    on conflict(user_id, zone_key) do update
      set last_notified_at = now()
      where public.provider_demand_alert_log.last_notified_at < now() - interval '15 minutes'
    returning user_id
  )
  insert into public.notifications(user_id, type, title, body, link, data)
  select e.user_id,
    'taxi_high_demand',
    case when e.plan_code = 'gold' then 'تنبيه فوري: طلبات تكسي مرتفعة' else 'تنبيه: منطقة طلب مرتفع' end,
    'ازدادت طلبات التكسي ضمن 2 كم من موقعك. افتح ممنون لاستلام الرحلات المتاحة.',
    '/profile',
    jsonb_build_object('zone_key', v_zone, 'waiting_requests', v_waiting, 'radius_km', 2, 'plan', e.plan_code)
  from eligible e join logged l on l.user_id = e.user_id;

  return new;
end;
$function$;

commit;
