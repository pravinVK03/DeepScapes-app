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

-- No browser client accesses these tables. The server-only service role bypasses RLS.
