-- Privacy is the core promise of this product, so it gets tested rather than
-- assumed. Every check below runs as the `authenticated` role with a JWT claim
-- impersonating a specific user — the same path a real request takes.
--
-- Any failure raises, so the script exits non-zero under `psql -v ON_ERROR_STOP=1`.
--
-- Cast: Alice and Carol share a family. Bob is a stranger in his own family and
-- should never see a single row of theirs.

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

reset role;

create or replace function public.assert(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'ASSERTION FAILED: %', p_msg;
  end if;
end;
$$;

-- Shared scratchpad for ids. RLS-free on purpose: the tests need to *name* a
-- row Bob cannot see in order to prove he cannot see it.
drop table if exists public.test_ids;
create table public.test_ids (k text primary key, v uuid);
grant all on public.test_ids to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@example.test', '{"display_name":"Alice"}'),
  (:'bob',   'bob@example.test',   '{"display_name":"Bob"}'),
  (:'carol', 'carol@example.test', '{"display_name":"Carol"}');

do $$ begin
  perform public.assert(
    (select count(*) from public.profiles) = 3,
    'signup trigger should have created a profile per auth user'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Alice builds her family
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.test_ids (k, v)
values ('family_a', public.create_family('Alice and Carol', 'Europe/London', 'GBP'));

insert into public.children (family_id, name, birthdate)
select v, 'Ellie', date '2018-04-02' from public.test_ids where k = 'family_a';

insert into public.test_ids (k, v)
select 'child_a', id from public.children where name = 'Ellie';

insert into public.events (family_id, type, title, starts_at, ends_at, location)
select v, 'handover', 'Handover at the park', now(), now(), 'Queen''s Park'
from public.test_ids where k = 'family_a';

insert into public.custody_periods (family_id, parent_profile_id, starts_at, ends_at)
select v, :'alice', now(), now() + interval '3 days'
from public.test_ids where k = 'family_a';

do $$ begin
  perform public.assert(
    (select count(*) from public.children) = 1,
    'Alice should see her own child'
  );
  perform public.assert(
    (select count(*) from public.families) = 1,
    'Alice should see exactly her own family'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Bob builds a separate family
-- ---------------------------------------------------------------------------

set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';

insert into public.test_ids (k, v)
values ('family_b', public.create_family('Bob', 'UTC', 'USD'));

insert into public.children (family_id, name)
select v, 'Sam' from public.test_ids where k = 'family_b';

-- ---------------------------------------------------------------------------
-- The isolation proof: Bob reads
-- ---------------------------------------------------------------------------

do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
begin
  perform public.assert(
    (select count(*) from public.families where id = v_family_a) = 0,
    'Bob must not see another family'
  );
  perform public.assert(
    (select count(*) from public.children where family_id = v_family_a) = 0,
    'Bob must not see another family''s children'
  );
  perform public.assert(
    (select count(*) from public.events where family_id = v_family_a) = 0,
    'Bob must not see another family''s events'
  );
  perform public.assert(
    (select count(*) from public.custody_periods where family_id = v_family_a) = 0,
    'Bob must not see another family''s custody schedule'
  );
  perform public.assert(
    (select count(*) from public.family_members where family_id = v_family_a) = 0,
    'Bob must not see another family''s membership'
  );
  perform public.assert(
    (select count(*) from public.invites where family_id = v_family_a) = 0,
    'Bob must not see another family''s invites'
  );
  -- Bob sees only himself: not Alice, not Carol.
  perform public.assert(
    (select count(*) from public.profiles) = 1,
    'Bob must not see profiles of people outside his family'
  );
  -- The balance function is SECURITY INVOKER, so RLS must starve it too.
  perform public.assert(
    (select count(*) from public.family_balance(v_family_a)) = 0,
    'Bob must not compute another family''s balance'
  );
end $$;

-- ---------------------------------------------------------------------------
-- The isolation proof: Bob writes
-- ---------------------------------------------------------------------------

do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
  v_child_a uuid := (select v from public.test_ids where k = 'child_a');
begin
  begin
    insert into public.children (family_id, name) values (v_family_a, 'Injected');
    raise exception 'ASSERTION FAILED: Bob inserted a child into another family';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.events (family_id, title, starts_at, ends_at)
    values (v_family_a, 'Injected', now(), now());
    raise exception 'ASSERTION FAILED: Bob inserted an event into another family';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.custody_periods (family_id, parent_profile_id, starts_at, ends_at)
    values (v_family_a, (select v from public.test_ids where k = 'family_a'),
            now(), now() + interval '1 day');
    raise exception 'ASSERTION FAILED: Bob inserted custody into another family';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;

  -- Silent no-ops rather than errors: UPDATE/DELETE filter through USING, so
  -- the correct outcome is zero rows affected.
  update public.children set name = 'Renamed' where family_id = v_family_a;
  perform public.assert(
    (select name from public.children where id = v_child_a) is null,
    'Bob should not even be able to read back the row he tried to rename'
  );

  delete from public.children where family_id = v_family_a;

  begin
    insert into public.family_members (family_id, profile_id, role, color_slot)
    values (v_family_a, (select auth.uid()), 'parent', 'b');
    raise exception 'ASSERTION FAILED: Bob joined another family by direct insert';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_invite(v_family_a);
    raise exception 'ASSERTION FAILED: Bob minted an invite to another family';
  exception when others then
    perform public.assert(
      sqlerrm like '%Not a member%',
      'create_invite should reject non-members, got: ' || sqlerrm
    );
  end;
end $$;

-- Storage: Bob must not be able to write into Alice's family folder.
do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('receipts', v_family_a || '/stolen.png');
    raise exception 'ASSERTION FAILED: Bob wrote into another family''s storage folder';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  perform public.assert(
    (select count(*) from public.children) = 2,
    'Alice''s child must still exist after Bob''s delete attempt'
  );
  perform public.assert(
    (select name from public.children
      where id = (select v from public.test_ids where k = 'child_a')) = 'Ellie',
    'Bob''s update must not have touched Alice''s child'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Joining by invite grants access, and only then
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.test_ids (k, v)
select 'invite', (public.create_invite(v, 'carol@example.test')).id
from public.test_ids where k = 'family_a';

set request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';

do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
  v_code text;
begin
  perform public.assert(
    (select count(*) from public.children where family_id = v_family_a) = 0,
    'Carol must see nothing before accepting'
  );

  -- Read the code with definer rights; Carol cannot select invites yet, which
  -- is exactly why accept_invite() takes the code rather than an id.
  select code into v_code from public.invites
  where id = (select v from public.test_ids where k = 'invite');

  perform public.assert(v_code is null, 'Carol must not be able to read the invite row');
end $$;

reset role;
select code as invite_code from public.invites
where id = (select v from public.test_ids where k = 'invite') \gset

set role authenticated;
set request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333"}';

select public.accept_invite(:'invite_code');

do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
begin
  perform public.assert(
    (select count(*) from public.children where family_id = v_family_a) = 1,
    'Carol should see the family''s child after accepting'
  );
  perform public.assert(
    (select count(*) from public.profiles) = 2,
    'Carol should now see Alice''s profile, and only Alice''s'
  );
  perform public.assert(
    (select color_slot from public.family_members
      where family_id = v_family_a and profile_id = auth.uid()) = 'b',
    'Carol should be assigned the second colour slot'
  );
  -- Re-accepting is idempotent, not an error.
  perform public.assert(
    public.accept_invite((select code from public.invites
      where id = (select v from public.test_ids where k = 'invite'))) = v_family_a,
    'Re-accepting an invite should be a no-op'
  );
end $$;

-- Bob is still shut out after all of that.
set request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare
  v_family_a uuid := (select v from public.test_ids where k = 'family_a');
begin
  perform public.assert(
    (select count(*) from public.children where family_id = v_family_a) = 0,
    'Bob must still see nothing of the other family'
  );
end $$;

reset role;
\echo '  RLS isolation: PASS'
