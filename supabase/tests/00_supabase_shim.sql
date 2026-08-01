-- Minimal stand-in for the parts of a Supabase database that the migrations
-- depend on, so the schema and its RLS policies can be exercised against a
-- plain PostgreSQL instance in CI or locally without Docker.
--
-- This file is TEST HARNESS ONLY. It is never applied to a real project —
-- Supabase provides all of this itself.
--
-- The role grants at the bottom matter more than they look. Supabase grants
-- table privileges to `authenticated` on everything in `public`, which means
-- RLS policies are the only thing standing between one family and another. If
-- this shim omitted those grants, isolation tests would pass because of a
-- missing GRANT rather than a working policy — a false green, and the exact
-- failure mode the tests exist to rule out.

-- Supabase installs extensions into a dedicated `extensions` schema which is
-- on the default search_path. Reproduce both so `gen_random_uuid()` resolves
-- in column defaults exactly as it will in production.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's implementation: the current user id is read out of the
-- request's JWT claims, which tests set with `set local request.jwt.claims`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Path segments excluding the filename: 'family-uuid/receipt.png' -> {family-uuid}
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Applies to the tables the migrations are about to create.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
