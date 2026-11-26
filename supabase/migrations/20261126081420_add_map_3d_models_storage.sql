insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map-3d-models', 'map-3d-models', true, 20971520, array['model/gltf-binary'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read map 3D models"
on storage.objects for select
to public
using (bucket_id = 'map-3d-models');

create policy "Super admins upload map 3D models"
on storage.objects for insert
to authenticated
with check (bucket_id = 'map-3d-models' and is_super_admin(auth.uid()));

create policy "Super admins update map 3D models"
on storage.objects for update
to authenticated
using (bucket_id = 'map-3d-models' and is_super_admin(auth.uid()))
with check (bucket_id = 'map-3d-models' and is_super_admin(auth.uid()));

create policy "Super admins delete map 3D models"
on storage.objects for delete
to authenticated
using (bucket_id = 'map-3d-models' and is_super_admin(auth.uid()));