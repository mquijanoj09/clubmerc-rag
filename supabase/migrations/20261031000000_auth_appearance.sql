-- Logo para el tema oscuro, imagen y mensaje de la pantalla de inicio de sesión.
alter table public.assistant_settings
  add column logo_dark_url text,
  add column auth_image_url text,
  add column auth_message text not null default '';

-- La imagen de inicio puede ser una fotografía: se amplía el límite del bucket.
update storage.buckets set file_size_limit = 5242880 where id = 'branding';
