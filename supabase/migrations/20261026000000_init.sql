-- =====================================================================
-- Asistente RAG: esquema inicial
-- Ejecutar en Supabase (SQL Editor o `supabase db push`).
-- =====================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Perfiles y roles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  -- Preguntas adicionales disponibles (no se renuevan mensualmente).
  bonus_balance integer not null default 0 check (bonus_balance >= 0),
  -- Total histórico de preguntas adicionales concedidas.
  bonus_granted_total integer not null default 0,
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse. El rol siempre es 'user':
-- los metadatos que envía el cliente nunca pueden asignar 'admin'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(new.raw_user_meta_data ->> 'full_name', 100), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Configuración del asistente (una sola fila)
-- ---------------------------------------------------------------------
create table public.assistant_settings (
  id integer primary key default 1 check (id = 1),
  -- Información general
  name text not null default 'Asistente',
  description text not null default 'Asistente especializado que responde con base en la documentación disponible.',
  topic text not null default 'la documentación proporcionada',
  welcome_message text not null default '¡Hola! ¿En qué puedo ayudarte hoy?',
  suggested_questions text[] not null default '{}',
  -- Tono y personalidad
  tone text not null default 'profesional'
    check (tone in ('formal', 'profesional', 'amigable', 'educativo', 'tecnico', 'casual')),
  communication_style text not null default '',
  response_length text not null default 'media'
    check (response_length in ('corta', 'media', 'detallada')),
  custom_instructions text not null default '',
  -- Restricciones
  allowed_topics text not null default '',
  rules text not null default '',
  procedures text not null default '',
  unknown_message text not null default 'No dispongo de información suficiente en la documentación para responder esa pregunta.',
  off_topic_message text not null default 'Solo puedo responder preguntas relacionadas con el tema de este asistente.',
  similarity_threshold real not null default 0.30 check (similarity_threshold between 0 and 1),
  -- Modelo y límites
  chat_model text not null default 'gpt-4.1-mini',
  monthly_free_questions integer not null default 20 check (monthly_free_questions >= 0),
  max_output_tokens integer not null default 800 check (max_output_tokens between 50 and 4000),
  max_input_tokens integer not null default 6000 check (max_input_tokens between 1000 and 30000),
  max_chunks integer not null default 5 check (max_chunks between 1 and 20),
  global_monthly_limit integer not null default 1000 check (global_monthly_limit >= 0),
  monthly_budget_usd numeric(10, 2) not null default 5 check (monthly_budget_usd >= 0),
  updated_at timestamptz not null default now()
);

insert into public.assistant_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Documentos y fragmentos (RAG)
-- ---------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'error')),
  error text,
  chunk_count integer not null default 0,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.document_chunks (
  id bigserial primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536) not null
);

create index document_chunks_document_id_idx on public.document_chunks (document_id);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Búsqueda semántica: devuelve los fragmentos más similares (coseno)
-- que superen el umbral, solo de documentos disponibles.
create function public.match_chunks(
  query_embedding extensions.vector(1536),
  match_count integer,
  min_similarity real
)
returns table (
  id bigint,
  document_id uuid,
  document_name text,
  chunk_index integer,
  content text,
  similarity real
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.document_id,
    d.name,
    c.chunk_index,
    c.content,
    (1 - (c.embedding operator(extensions.<=>) query_embedding))::real as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where d.status = 'ready'
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by c.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Conversaciones y mensajes
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- answered | off_topic | no_info | error (solo mensajes del asistente)
  status text check (status in ('answered', 'off_topic', 'no_info', 'error')),
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);
create index messages_user_created_idx on public.messages (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Cuotas mensuales, solicitudes y consumo
-- ---------------------------------------------------------------------
-- Una fila por usuario y mes. Al comenzar un mes no existe fila, por lo que
-- el contador empieza en 0 automáticamente (renovación sin tareas programadas).
create table public.monthly_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period date not null,
  free_used integer not null default 0 check (free_used >= 0),
  bonus_used integer not null default 0 check (bonus_used >= 0),
  primary key (user_id, period)
);

create table public.question_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested integer not null check (requested between 1 and 500),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  granted integer check (granted >= 0),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index question_requests_status_idx on public.question_requests (status, created_at desc);
create index question_requests_user_idx on public.question_requests (user_id, created_at desc);

create table public.openai_usage (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('chat', 'classify', 'embedding_query', 'embedding_document')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index openai_usage_created_idx on public.openai_usage (created_at);

create function public.current_period()
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', now() at time zone 'utc'))::date;
$$;

-- Reserva (descuenta) una pregunta de forma atómica antes de llamar a OpenAI.
-- Bloquea la fila de configuración para serializar reservas y así respetar
-- también el límite global. Devuelve { status, bucket, period }.
create function public.reserve_question(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := public.current_period();
  v_free_limit integer;
  v_global_limit integer;
  v_global_used integer;
  v_free_used integer;
  v_bonus integer;
begin
  select monthly_free_questions, global_monthly_limit
    into v_free_limit, v_global_limit
    from public.assistant_settings where id = 1
    for update;

  select bonus_balance into v_bonus from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;

  select coalesce(sum(free_used + bonus_used), 0) into v_global_used
    from public.monthly_usage where period = v_period;
  if v_global_used >= v_global_limit then
    return jsonb_build_object('status', 'global_limit');
  end if;

  insert into public.monthly_usage (user_id, period) values (p_user, v_period)
    on conflict do nothing;
  select free_used into v_free_used from public.monthly_usage
    where user_id = p_user and period = v_period for update;

  if v_free_used < v_free_limit then
    update public.monthly_usage set free_used = free_used + 1
      where user_id = p_user and period = v_period;
    return jsonb_build_object('status', 'ok', 'bucket', 'free', 'period', v_period);
  elsif v_bonus > 0 then
    update public.profiles set bonus_balance = bonus_balance - 1 where id = p_user;
    update public.monthly_usage set bonus_used = bonus_used + 1
      where user_id = p_user and period = v_period;
    return jsonb_build_object('status', 'ok', 'bucket', 'bonus', 'period', v_period);
  end if;

  return jsonb_build_object('status', 'no_quota');
end;
$$;

-- Devuelve una pregunta reservada cuando la consulta no generó una respuesta
-- válida (fuera de tema, sin información o error técnico).
create function public.refund_question(p_user uuid, p_bucket text, p_period date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bucket = 'free' then
    update public.monthly_usage set free_used = greatest(free_used - 1, 0)
      where user_id = p_user and period = p_period;
  elsif p_bucket = 'bonus' then
    update public.monthly_usage set bonus_used = greatest(bonus_used - 1, 0)
      where user_id = p_user and period = p_period;
    update public.profiles set bonus_balance = bonus_balance + 1 where id = p_user;
  end if;
end;
$$;

create function public.get_quota(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'free_limit', s.monthly_free_questions,
    'free_used', coalesce(u.free_used, 0),
    'bonus_used', coalesce(u.bonus_used, 0),
    'bonus_balance', p.bonus_balance,
    'remaining', greatest(s.monthly_free_questions - coalesce(u.free_used, 0), 0) + p.bonus_balance
  )
  from public.profiles p
  cross join public.assistant_settings s
  left join public.monthly_usage u on u.user_id = p.id and u.period = public.current_period()
  where p.id = p_user and s.id = 1;
$$;

-- Concede preguntas adicionales manualmente.
create function public.grant_bonus(p_user uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    raise exception 'INVALID_AMOUNT';
  end if;
  update public.profiles
    set bonus_balance = bonus_balance + p_amount,
        bonus_granted_total = bonus_granted_total + p_amount
    where id = p_user;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end;
$$;

-- Aprueba o rechaza una solicitud. Solo actúa si sigue pendiente,
-- lo que impide aprobar la misma solicitud dos veces.
create function public.review_request(
  p_request uuid,
  p_approve boolean,
  p_granted integer,
  p_admin uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_approve and (p_granted is null or p_granted < 1 or p_granted > 1000) then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.question_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        granted = case when p_approve then p_granted else 0 end,
        reviewed_by = p_admin,
        reviewed_at = now()
    where id = p_request and status = 'pending'
    returning user_id into v_user;

  if v_user is null then
    raise exception 'ALREADY_REVIEWED';
  end if;

  if p_approve then
    update public.profiles
      set bonus_balance = bonus_balance + p_granted,
          bonus_granted_total = bonus_granted_total + p_granted
      where id = v_user;
  end if;
end;
$$;

-- Las funciones que modifican saldos solo pueden ejecutarse desde el backend
-- (service role). Los usuarios autenticados no pueden invocarlas.
revoke execute on function public.reserve_question(uuid) from public, anon, authenticated;
revoke execute on function public.refund_question(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.get_quota(uuid) from public, anon, authenticated;
revoke execute on function public.grant_bonus(uuid, integer) from public, anon, authenticated;
revoke execute on function public.review_request(uuid, boolean, integer, uuid) from public, anon, authenticated;
revoke execute on function public.match_chunks(extensions.vector, integer, real) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.reserve_question(uuid) to service_role;
grant execute on function public.refund_question(uuid, text, date) to service_role;
grant execute on function public.get_quota(uuid) to service_role;
grant execute on function public.grant_bonus(uuid, integer) to service_role;
grant execute on function public.review_request(uuid, boolean, integer, uuid) to service_role;
grant execute on function public.match_chunks(extensions.vector, integer, real) to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- Los usuarios solo leen sus propios datos. Las escrituras sensibles
-- (saldos, configuración, documentos) se hacen desde el backend.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.assistant_settings enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.monthly_usage enable row level security;
alter table public.question_requests enable row level security;
alter table public.openai_usage enable row level security;

create policy "Perfil propio o admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "Admin lee configuración" on public.assistant_settings
  for select to authenticated using (public.is_admin());

create policy "Admin lee documentos" on public.documents
  for select to authenticated using (public.is_admin());

create policy "Admin lee fragmentos" on public.document_chunks
  for select to authenticated using (public.is_admin());

create policy "Conversaciones propias: leer" on public.conversations
  for select to authenticated using (user_id = auth.uid());
create policy "Conversaciones propias: renombrar" on public.conversations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Conversaciones propias: eliminar" on public.conversations
  for delete to authenticated using (user_id = auth.uid());

create policy "Mensajes propios: leer" on public.messages
  for select to authenticated using (user_id = auth.uid());

create policy "Consumo propio o admin" on public.monthly_usage
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "Solicitudes propias o admin" on public.question_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "Admin lee consumo OpenAI" on public.openai_usage
  for select to authenticated using (public.is_admin());

-- Evita que un usuario cambie columnas distintas al título de sus conversaciones.
revoke update on public.conversations from authenticated;
grant update (title) on public.conversations to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket privado para documentos (sin políticas públicas;
-- solo el backend con service role puede leer y escribir).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;
