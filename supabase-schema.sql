-- Run this in the Supabase SQL Editor before starting the app.
-- The application uses its server-only service role through Next.js API routes.

create table if not exists public.scapes (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scapes_updated_at_idx on public.scapes (updated_at desc);
-- Supports the targeted owner/collaborator JSON containment queries used by
-- the Scape loader. Existing projects can run this statement independently.
create index if not exists scapes_payload_gin_idx on public.scapes using gin (payload jsonb_path_ops);

create table if not exists public.templates (
  name text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9-]{3,32}$'),
  email text not null,
  display_name text,
  avatar text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists avatar_path text;

-- Data model v2: keep the Scape row compact and put growing collections in
-- dedicated tables. `payload` remains only as a temporary compatibility field
-- during rollout; new application reads must not select it.
alter table public.scapes add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.scapes add column if not exists title text;
alter table public.scapes add column if not exists description text not null default '';
alter table public.scapes add column if not exists template text not null default 'Blank Scape';
alter table public.scapes add column if not exists cover_value text not null default '#1d4ed8';
alter table public.scapes add column if not exists cover_path text;
alter table public.scapes add column if not exists cover_position text;
alter table public.scapes add column if not exists cover_zoom numeric;
alter table public.scapes add column if not exists starred boolean not null default false;
alter table public.scapes add column if not exists archived boolean not null default false;
alter table public.scapes add column if not exists hidden_sections jsonb not null default '[]'::jsonb;

create table if not exists public.scape_collaborators (
  scape_id text not null references public.scapes(id) on delete cascade,
  collaborator_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  name text not null default '',
  permission text not null check (permission in ('view', 'edit')),
  pending boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (scape_id, collaborator_key)
);

create table if not exists public.scape_resources (
  id text not null,
  scape_id text not null references public.scapes(id) on delete cascade,
  type text not null check (type in ('note', 'task', 'file', 'image', 'video', 'audio', 'link')),
  title text not null,
  detail text not null default '',
  occurred_at timestamptz not null default now(),
  done boolean not null default false,
  starred boolean not null default false,
  group_name text,
  content text,
  download_url text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scape_id, id)
);

create table if not exists public.scape_activity (
  id text not null,
  scape_id text not null references public.scapes(id) on delete cascade,
  action text not null,
  detail text not null default '',
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  primary key (scape_id, id)
);

create table if not exists public.scape_browser_state (
  scape_id text primary key references public.scapes(id) on delete cascade,
  profile_id text,
  active_session_id text,
  active_session_name text,
  live_view_url text,
  expires_at timestamptz,
  last_target text,
  last_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.scape_browser_sessions (
  session_id text primary key,
  scape_id text not null references public.scapes(id) on delete cascade,
  name text not null,
  captured_at timestamptz not null default now(),
  active_tab integer,
  tabs jsonb not null default '[]'::jsonb,
  source_session_id text
);

create table if not exists public.scape_browser_events (
  id text not null,
  scape_id text not null references public.scapes(id) on delete cascade,
  session_id text,
  type text not null,
  occurred_at timestamptz not null default now(),
  url text,
  target text,
  detail text,
  primary key (scape_id, id)
);

-- The original JSON model allowed identifiers such as "created" in every
-- Scape. Scope imported identifiers to their parent before the backfill runs.
alter table public.scape_resources drop constraint if exists scape_resources_pkey;
alter table public.scape_resources add primary key (scape_id, id);
alter table public.scape_activity drop constraint if exists scape_activity_pkey;
alter table public.scape_activity add primary key (scape_id, id);
alter table public.scape_browser_events drop constraint if exists scape_browser_events_pkey;
alter table public.scape_browser_events add primary key (scape_id, id);

create index if not exists scapes_owner_updated_idx on public.scapes (owner_id, updated_at desc);
create index if not exists scape_collaborators_user_idx on public.scape_collaborators (user_id, scape_id);
create index if not exists scape_collaborators_email_idx on public.scape_collaborators (email, scape_id);
create index if not exists scape_resources_scape_updated_idx on public.scape_resources (scape_id, updated_at desc);
create index if not exists scape_activity_scape_time_idx on public.scape_activity (scape_id, occurred_at desc);
create index if not exists scape_browser_events_scape_time_idx on public.scape_browser_events (scape_id, occurred_at desc);

-- One-time compatibility backfill from the original JSON payload. This is
-- idempotent, so it may be run again after a failed migration. Base64 covers
-- are deliberately not copied; the application uploads them to Storage the
-- next time the owner saves the Scape.
update public.scapes
set
  owner_id = case when coalesce(payload->>'ownerId', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (payload->>'ownerId')::uuid else owner_id end,
  title = coalesce(title, nullif(payload->>'title', ''), 'Untitled Scape'),
  description = case when description = '' then coalesce(payload->>'description', '') else description end,
  template = case when template = 'Blank Scape' then coalesce(nullif(payload->>'template', ''), template) else template end,
  cover_value = case when cover_value = '#1d4ed8' and coalesce(payload->>'cover', '') !~ '^data:' then coalesce(nullif(payload->>'cover', ''), cover_value) else cover_value end,
  cover_position = coalesce(cover_position, payload->>'coverPosition'),
  cover_zoom = coalesce(cover_zoom, case when coalesce(payload->>'coverZoom', '') ~ '^[0-9]+(\\.[0-9]+)?$' then (payload->>'coverZoom')::numeric end),
  starred = starred or coalesce((payload->>'starred')::boolean, false),
  archived = archived or coalesce((payload->>'archived')::boolean, false),
  hidden_sections = case when hidden_sections = '[]'::jsonb then coalesce(payload->'hiddenSections', hidden_sections) else hidden_sections end
where payload is not null;

insert into public.scape_collaborators (scape_id, collaborator_key, user_id, email, name, permission, pending)
select
  s.id,
  coalesce(nullif(person->>'id', ''), nullif(person->>'email', ''), md5(person::text)),
  case when coalesce(person->>'id', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (person->>'id')::uuid end,
  nullif(person->>'email', ''),
  coalesce(person->>'name', ''),
  case when person->>'permission' = 'view' then 'view' else 'edit' end,
  coalesce((person->>'pending')::boolean, false)
from public.scapes s
cross join lateral jsonb_array_elements(coalesce(s.payload->'collaborators', '[]'::jsonb)) person
on conflict (scape_id, collaborator_key) do nothing;

insert into public.scape_resources (id, scape_id, type, title, detail, occurred_at, done, starred, group_name, content, download_url, mime_type)
select
  item->>'id', s.id, item->>'type', coalesce(item->>'title', 'Untitled resource'), coalesce(item->>'detail', ''),
  case when coalesce(item->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (item->>'date')::timestamptz else coalesce(s.updated_at, now()) end, coalesce((item->>'done')::boolean, false), coalesce((item->>'starred')::boolean, false),
  nullif(item->>'group', ''), nullif(item->>'content', ''), nullif(item->>'downloadUrl', ''), nullif(item->>'mimeType', '')
from public.scapes s
cross join lateral jsonb_array_elements(coalesce(s.payload->'resources', '[]'::jsonb)) item
where coalesce(item->>'id', '') <> '' and item->>'type' in ('note', 'task', 'file', 'image', 'video', 'audio', 'link')
on conflict (scape_id, id) do update set title = excluded.title, detail = excluded.detail, done = excluded.done, starred = excluded.starred, group_name = excluded.group_name, content = excluded.content, download_url = excluded.download_url, mime_type = excluded.mime_type, updated_at = now();

insert into public.scape_activity (id, scape_id, action, detail, occurred_at, actor_id, actor_name, actor_email)
select
  item->>'id', s.id, coalesce(item->>'action', 'Activity'), coalesce(item->>'detail', ''), case when coalesce(item->>'time', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (item->>'time')::timestamptz else coalesce(s.updated_at, now()) end,
  case when coalesce(item->>'actorId', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (item->>'actorId')::uuid end,
  nullif(item->>'actorName', ''), nullif(item->>'actorEmail', '')
from public.scapes s
cross join lateral jsonb_array_elements(coalesce(s.payload->'activity', '[]'::jsonb)) item
where coalesce(item->>'id', '') <> ''
on conflict (scape_id, id) do nothing;

-- Private Storage buckets. The server creates signed URLs; media paths rather
-- than base64 bytes are stored in database records and Auth metadata.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('deepscapes-avatars', 'deepscapes-avatars', false, 524288, array['image/jpeg', 'image/png', 'image/webp']),
  ('deepscapes-covers', 'deepscapes-covers', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Repair confirmed Auth accounts created before profile provisioning became
-- idempotent. It never changes an existing profile and intentionally excludes
-- unconfirmed email addresses.
insert into public.profiles (id, username, email)
select
  u.id,
  left(coalesce(nullif(btrim(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'member'), 24) || '-' || left(replace(u.id::text, '-', ''), 6),
  u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null
  and u.email_confirmed_at is not null
on conflict do nothing;

alter table public.scapes enable row level security;
alter table public.templates enable row level security;
alter table public.profiles enable row level security;
alter table public.scape_collaborators enable row level security;
alter table public.scape_resources enable row level security;
alter table public.scape_activity enable row level security;
alter table public.scape_browser_state enable row level security;
alter table public.scape_browser_sessions enable row level security;
alter table public.scape_browser_events enable row level security;

-- No browser client accesses these tables directly. The server-only service
-- role bypasses RLS; keep policies closed until a deliberate direct-client API
-- is introduced.
