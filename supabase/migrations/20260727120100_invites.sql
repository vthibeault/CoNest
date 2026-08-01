-- Invites: how the second parent joins.
--
-- The whole product is solo-first, so this is intentionally lightweight — a
-- code you can text to your co-parent, not an account-provisioning flow.
--
-- The invitee is by definition not yet a family member, so they cannot read
-- the invites table at all. Redemption goes through accept_invite(), which
-- looks the code up with definer rights. That also means an invite code is a
-- bearer token: anyone holding it can join, which is why codes are random,
-- expiring, and single-use.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  code text not null unique,
  invited_email text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz
);

create index invites_family_idx on public.invites (family_id);

-- Ambiguity-free alphabet: no O/0, I/1/L, U/V. These codes get read aloud and
-- retyped from a text message, so the character set matters more than length.
create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTWXYZ23456789';
  v_code text := '';
  i integer;
begin
  for i in 1..10 loop
    v_code := v_code || substr(
      v_alphabet,
      1 + floor(random() * length(v_alphabet))::int,
      1
    );
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_invite(
  p_family_id uuid,
  p_invited_email text default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites;
  v_code text;
  v_attempt integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Definer rights bypass RLS, so membership is checked explicitly here.
  if not public.is_family_member(p_family_id) then
    raise exception 'Not a member of this family';
  end if;

  -- Retry on the astronomically unlikely collision rather than failing the
  -- user's click.
  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_invite_code();
    begin
      insert into public.invites (family_id, code, invited_email, created_by)
      values (p_family_id, v_code, nullif(trim(p_invited_email), ''), v_uid)
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- Redeems a code and returns the family joined. Safe to call twice: if you
-- are already a member it succeeds quietly rather than erroring.
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites;
  v_slot text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.invites
  where code = upper(trim(p_code))
  for update;

  if v_invite.id is null then
    raise exception 'That invite code is not valid';
  end if;

  -- Idempotent: re-tapping the link after joining should not be an error.
  if exists (
    select 1 from public.family_members fm
    where fm.family_id = v_invite.family_id and fm.profile_id = v_uid
  ) then
    return v_invite.family_id;
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'That invite has already been used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'That invite has expired';
  end if;

  select slot into v_slot
  from unnest(array['a', 'b', 'c', 'd']) as slot
  where not exists (
    select 1 from public.family_members fm
    where fm.family_id = v_invite.family_id and fm.color_slot = slot
  )
  limit 1;

  if v_slot is null then
    raise exception 'This family is full';
  end if;

  insert into public.family_members (family_id, profile_id, role, color_slot)
  values (v_invite.family_id, v_uid, 'parent', v_slot);

  update public.invites
  set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_invite.id;

  return v_invite.family_id;
end;
$$;

alter table public.invites enable row level security;

create policy "invites are readable by family members"
  on public.invites for select to authenticated
  using (public.is_family_member(family_id));

-- Creation goes through create_invite() so codes are always server-generated.
create policy "invites are revocable by family members"
  on public.invites for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "invites are deletable by family members"
  on public.invites for delete to authenticated
  using (public.is_family_member(family_id));

grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop function if exists public.accept_invite(text);
-- drop function if exists public.create_invite(uuid, text);
-- drop function if exists public.generate_invite_code();
-- drop table if exists public.invites cascade;
