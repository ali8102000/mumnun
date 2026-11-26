create or replace function public.sync_provider_presence_geography()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := extensions.st_setsrid(
      extensions.st_makepoint(new.lng, new.lat), 4326
    )::extensions.geography;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_provider_presence_geography_before_write on public.provider_presence;
create trigger sync_provider_presence_geography_before_write
before insert or update of lat, lng on public.provider_presence
for each row execute function public.sync_provider_presence_geography();