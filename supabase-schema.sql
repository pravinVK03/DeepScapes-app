-- Run this in the Supabase SQL Editor before starting the app.
-- The application uses its server-only service role through Next.js API routes.

create table if not exists public.scapes (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scapes_updated_at_idx on public.scapes (updated_at desc);

create table if not exists public.templates (
  name text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9-]{3,32}$'),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.scapes enable row level security;
alter table public.templates enable row level security;
alter table public.profiles enable row level security;

-- No browser client accesses these tables. The server-only service role bypasses RLS.
