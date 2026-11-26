update storage.buckets
set allowed_mime_types = array['model/gltf-binary'],
    file_size_limit = 20971520
where id = 'map-3d-models';