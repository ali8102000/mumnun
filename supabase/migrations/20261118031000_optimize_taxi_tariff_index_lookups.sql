-- Keep the fare formula unchanged; perform exact indexed tariff lookups with explicit global fallback.
create or replace function public.prepare_taxi_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rate numeric;
  v_base_fare numeric;
  v_per_min_rate numeric;
  v_min_fare numeric;
  v_base numeric;
  v_raw numeric;
  v_tier_percent numeric := 0;
  v_peak_enabled boolean := false;
  v_peak_percent numeric := 0;
  v_urgency_enabled boolean := false;
  v_urgency_cap numeric := 0;
  v_tier_multiplier numeric := 1;
  v_trip_multiplier numeric := 1;
  v_extra_time_fare numeric := 0;
  v_governorate text;
begin
  if NEW.type <> 'taxi' then return NEW; end if;
  NEW.trip_type := COALESCE(NEW.trip_type, 'one_way');
  NEW.extra_minutes := COALESCE(NEW.extra_minutes, 0);
  if NEW.trip_type not in ('one_way','round_trip','second_trip','stop') then
    raise exception 'نوع الرحلة غير صالح';
  end if;
  if NEW.extra_minutes < 0 or NEW.extra_minutes > 120 or NEW.extra_minutes % 5 <> 0 then
    raise exception 'وقت الانتظار يجب أن يكون من 0 إلى 120 دقيقة وبفواصل 5 دقائق';
  end if;
  if NEW.vehicle_category::text = 'large' then
    NEW.vehicle_type := COALESCE(NEW.vehicle_type,
      case when COALESCE(NEW.notes,'') ILIKE '%كيا ركاب%' then 'kia_passenger' else 'kia_cargo' end);
    if NEW.pickup_lat is null or NEW.pickup_lng is null then
      raise exception 'نقطة الانطلاق مطلوبة';
    end if;
    NEW.distance_km := null;
    NEW.duration_min := null;
    NEW.price_estimate := null;
    NEW.commission := 0;
    NEW.status := 'searching';
    NEW.searching_started_at := now();
    NEW.pricing_mode := case when NEW.customer_price is not null then 'fixed' else 'negotiable' end;
    NEW.taxi_urgency_enabled := false;
    NEW.taxi_urgency_percent := 0;
    NEW.taxi_peak_percent := 0;
    return NEW;
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'أنشئ طلب التاكسي من خدمة التسعير الآمنة';
  end if;
  NEW.vehicle_type := null;
  if NEW.distance_km is null or NEW.distance_km <= 0 or NEW.duration_min is null
     or NEW.duration_min < 0 or NEW.pickup_lat is null or NEW.pickup_lng is null
     or NEW.dest_lat is null or NEW.dest_lng is null then
    raise exception 'بيانات الطريق غير مكتملة';
  end if;

  v_governorate := COALESCE(NEW.governorate_key, 'all');

  -- Exact governorate tariff first, then the global row; both use the unique composite index.
  select base_fare, per_km_rate, per_min_rate
    into v_base_fare, v_rate, v_per_min_rate
    from public.pricing_settings
    where service_type = 'economy'
      and is_intercity = COALESCE(NEW.is_intercity, false)
      and governorate_key = v_governorate;
  if not found and v_governorate <> 'all' then
    select base_fare, per_km_rate, per_min_rate
      into v_base_fare, v_rate, v_per_min_rate
      from public.pricing_settings
      where service_type = 'economy'
        and is_intercity = COALESCE(NEW.is_intercity, false)
        and governorate_key = 'all';
  end if;
  if v_base_fare is null or v_rate is null or v_per_min_rate is null then
    raise exception 'تعريفة الاقتصاد غير متوفرة';
  end if;

  v_base := greatest(1000::numeric, v_base_fare + (NEW.distance_km * v_rate) + (NEW.duration_min * v_per_min_rate));

  if NEW.vehicle_category::text = 'premium' then
    v_tier_percent := case when v_base < 10000 then 20 when v_base <= 50000 then 15 else 5 end;
  elsif NEW.vehicle_category::text = 'luxury' then
    v_tier_percent := case when v_base < 10000 then 40 when v_base <= 50000 then 25 else 10 end;
  end if;

  select peak_enabled, peak_percent into v_peak_enabled, v_peak_percent
    from public.taxi_pricing_controls where governorate_key = v_governorate;
  if not found then
    select peak_enabled, peak_percent into v_peak_enabled, v_peak_percent
      from public.taxi_pricing_controls where governorate_key = 'all';
  end if;
  select urgency_enabled, urgency_max_percent into v_urgency_enabled, v_urgency_cap
    from public.taxi_pricing_controls where governorate_key = 'all';

  if NEW.trip_type in ('round_trip','second_trip') then
    v_trip_multiplier := case when NEW.trip_type = 'round_trip' then 1.8 else 2 end;
  end if;
  v_extra_time_fare := ceil(NEW.extra_minutes::numeric / 5) * 500;
  v_tier_multiplier := 1 + (v_tier_percent / 100.0);
  v_raw := v_base * v_tier_multiplier * v_trip_multiplier + v_extra_time_fare;
  if NEW.trip_type = 'round_trip' then
    v_raw := v_base * v_tier_multiplier * 2 * 0.9 + v_extra_time_fare;
  end if;

  if COALESCE(v_peak_enabled, false) then
    v_raw := v_raw * (1 + greatest(0, least(200, COALESCE(v_peak_percent, 0))) / 100.0);
    NEW.taxi_peak_percent := greatest(0, least(200, COALESCE(v_peak_percent, 0)));
  else
    NEW.taxi_peak_percent := 0;
  end if;
  if COALESCE(NEW.taxi_urgency_enabled, false) and COALESCE(v_urgency_enabled, false) then
    NEW.taxi_urgency_percent := greatest(0, least(COALESCE(v_urgency_cap, 0), 100));
    v_raw := v_raw * (1 + NEW.taxi_urgency_percent / 100.0);
    NEW.taxi_urgency_enabled := NEW.taxi_urgency_percent > 0;
  else
    NEW.taxi_urgency_enabled := false;
    NEW.taxi_urgency_percent := 0;
  end if;

  select min_fare into v_min_fare
    from public.pricing_settings
    where service_type = NEW.vehicle_category::text
      and is_intercity = COALESCE(NEW.is_intercity, false)
      and governorate_key = v_governorate;
  if not found and v_governorate <> 'all' then
    select min_fare into v_min_fare
      from public.pricing_settings
      where service_type = NEW.vehicle_category::text
        and is_intercity = COALESCE(NEW.is_intercity, false)
        and governorate_key = 'all';
  end if;

  NEW.price_estimate := greatest(1000::numeric, COALESCE(v_min_fare, 0), round(v_raw / 250) * 250);
  NEW.commission := 0;
  NEW.status := 'searching';
  NEW.searching_started_at := now();
  return NEW;
end;
$function$;
