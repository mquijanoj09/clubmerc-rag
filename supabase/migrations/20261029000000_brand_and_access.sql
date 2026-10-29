-- =====================================================================
-- Personalización desde el panel: marca, acceso por dominio y claves.
-- =====================================================================

-- Marca y acceso (se editan desde /admin/brand)
alter table public.assistant_settings
  add column brand_color text not null default '#1e293b'
    check (brand_color ~* '^#[0-9a-f]{6}$'),
  add column brand_accent text not null default '#64748b'
    check (brand_accent ~* '^#[0-9a-f]{6}$'),
  add column logo_url text,
  -- Dominios de correo autorizados a registrarse (sin @). Vacío = cualquiera.
  add column allowed_email_domains text[] not null default '{}';

-- Claves de terceros guardadas desde el panel (cifradas por la aplicación).
-- RLS activado y sin políticas: solo el backend con service role puede leerla.
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Bucket público para el logo (las imágenes de marca no son sensibles).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 524288, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- El registro solo se permite a los dominios configurados. Se valida en la
-- base de datos para que no pueda saltarse desde el navegador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domains text[];
begin
  select allowed_email_domains into v_domains from public.assistant_settings where id = 1;
  if coalesce(array_length(v_domains, 1), 0) > 0
     and lower(split_part(coalesce(new.email, ''), '@', 2)) <> all (v_domains) then
    raise exception 'EMAIL_DOMAIN_NOT_ALLOWED';
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(new.raw_user_meta_data ->> 'full_name', 100), '')
  );
  return new;
end;
$$;
