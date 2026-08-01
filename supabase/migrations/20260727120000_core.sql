-- Core: families, profiles, membership, children.
--
-- The security model in one paragraph: every row that belongs to a family
-- carries a family_id, and every policy on it reduces to "is the caller a
-- member of that family?". That question is answered by is_family_member(),
-- which is SECURITY DEFINER so it can read family_members without tripping
-- the RLS policy on family_members itself (a plain query there would recurse
-- forever). Every SECURITY DEFINER function below re-checks membership by
-- hand, because bypassing RLS means the policies are no longer doing it.

create extension if not exists "pgcrypto" with schema extensions;
-- btree_gist lets a GiST exclusion constraint mix uuid equality with range
-- overlap, which is how custody periods are kept non-overlapping (0003).
create extension if not exists "btree_gist" with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  -- All-day events and custody boundaries mean "midnight where the family
  -- lives", not "midnight UTC". Without this, every DST change and every trip
  -- abroad would quietly shift who has the kids.
  timezone text not null default 'UTC',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'parent' check (role in ('parent')),
  -- Drives the custody colour (slot 'a' = clay, 'b' = blue). Stored rather
  -- than derived so a parent's colour never changes under them.
  color_slot text not null check (color_slot in ('a', 'b', 'c', 'd')),
  joined_at timestamptz not null default now(),
  -- This primary key is also the target of composite foreign keys from
  -- custody_periods, expenses and friends, so the database itself guarantees
  -- you can never assign custody or a payment to someone outside the family.
  primary key (family_id, profile_id),
  unique (family_id, color_slot)
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  birthdate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_family_idx on public.children (family_id);
create index family_members_profile_idx on public.family_members (profile_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- auth.uid() is wrapped in a scalar subquery throughout so Postgres evaluates
-- it once per statement instead of once per row.
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = (select auth.uid())
  );
$$;

create or replace function public.shares_family_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members mine
    join public.family_members theirs on theirs.family_id = mine.family_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = p_profile_id
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

-- Every auth user gets a profile automatically, so the app never has to cope
-- with a signed-in user who has no profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Parent'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Creates the family and its first membership in one transaction. Doing this
-- as an RPC avoids the window where a family exists with no members — which
-- would be a row nobody, including its creator, could read back.
create or replace function public.create_family(
  p_name text,
  p_timezone text default 'UTC',
  p_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_family_id uuid;
  v_timezone text := coalesce(p_timezone, 'UTC');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- An unrecognised timezone would poison every date calculation later, so
  -- fall back rather than store something Postgres cannot resolve.
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  insert into public.families (name, timezone, currency, created_by)
  values (p_name, v_timezone, upper(coalesce(p_currency, 'USD')), v_uid)
  returning id into v_family_id;

  insert into public.family_members (family_id, profile_id, role, color_slot)
  values (v_family_id, v_uid, 'parent', 'a');

  return v_family_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.family_members enable row level security;
alter table public.children enable row level security;

-- families. Insert goes through create_family(), so there is deliberately no
-- direct insert policy.
create policy "families are readable by their members"
  on public.families for select to authenticated
  using (public.is_family_member(id));

create policy "families are updatable by their members"
  on public.families for update to authenticated
  using (public.is_family_member(id))
  with check (public.is_family_member(id));

create policy "families are deletable by their creator"
  on public.families for delete to authenticated
  using (created_by = (select auth.uid()));

-- profiles. You can see yourself, and anyone you share a family with — that
-- is what puts a co-parent's name on their custody blocks. Nobody else.
create policy "profiles are readable by self and co-parents"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_family_with(id));

create policy "profiles are insertable by self"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles are updatable by self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- family_members. Membership is granted only by create_family() and
-- accept_invite(), never by a direct insert, so no insert policy exists.
create policy "memberships are readable by family members"
  on public.family_members for select to authenticated
  using (public.is_family_member(family_id));

create policy "members can remove themselves"
  on public.family_members for delete to authenticated
  using (profile_id = (select auth.uid()));

-- children.
create policy "children are readable by family members"
  on public.children for select to authenticated
  using (public.is_family_member(family_id));

create policy "children are insertable by family members"
  on public.children for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "children are updatable by family members"
  on public.children for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "children are deletable by family members"
  on public.children for delete to authenticated
  using (public.is_family_member(family_id));

grant execute on function public.create_family(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop function if exists public.create_family(text, text, text);
-- drop function if exists public.shares_family_with(uuid);
-- drop function if exists public.is_family_member(uuid);
-- drop table if exists public.children, public.family_members,
--   public.profiles, public.families cascade;
-- drop function if exists public.set_updated_at();
