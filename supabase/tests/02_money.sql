-- Exercises the reconciliation maths and the splits-sum-to-total invariant.
-- The Expenses UI is a later session, but the arithmetic underneath it is the
-- thing a silent bug would damage most, so it is proven now.
--
-- Runs after 01_rls_isolation.sql and reuses its state: family_a contains
-- Alice (slot a) and Carol (slot b). Everything below runs as an authenticated
-- user, so RLS is in force throughout.

\set alice '11111111-1111-1111-1111-111111111111'
\set carol '33333333-3333-3333-3333-333333333333'

set role authenticated;
set request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- ---------------------------------------------------------------------------
-- An even split
-- ---------------------------------------------------------------------------
-- Alice pays 100.00 for school shoes and they halve it.

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_expense uuid;
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into public.expenses (family_id, paid_by, amount_cents, description, status)
  values (v_family, v_alice, 10000, 'School shoes', 'confirmed')
  returning id into v_expense;

  insert into public.expense_splits (expense_id, family_id, profile_id, share_cents)
  values (v_expense, v_family, v_alice, 5000),
         (v_expense, v_family, v_carol, 5000);

  set constraints all immediate;

  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_alice) = 5000,
    'Alice paid 100.00 split evenly, so she should be owed 50.00'
  );
  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_carol) = -5000,
    'Carol should owe 50.00'
  );
end $$;

-- ---------------------------------------------------------------------------
-- An uneven split, paid by the other parent
-- ---------------------------------------------------------------------------
-- Carol pays 100.00 for a school trip, split 70/30 against Alice.

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_expense uuid;
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into public.expenses (family_id, paid_by, amount_cents, description, status)
  values (v_family, v_carol, 10000, 'School trip', 'confirmed')
  returning id into v_expense;

  insert into public.expense_splits (expense_id, family_id, profile_id, share_cents)
  values (v_expense, v_family, v_alice, 7000),
         (v_expense, v_family, v_carol, 3000);

  set constraints all immediate;

  -- Alice: paid 10000, responsible for 5000 + 7000.
  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_alice) = -2000,
    'Alice should now owe 20.00 net'
  );
  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_carol) = 2000,
    'Carol should now be owed 20.00 net'
  );
end $$;

-- ---------------------------------------------------------------------------
-- A partial settlement
-- ---------------------------------------------------------------------------
-- Alice sends Carol 12.00 of the 20.00 she owes.

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into public.settlements (family_id, from_profile, to_profile, amount_cents, note)
  values (v_family, v_alice, v_carol, 1200, 'Partial, rest next week');

  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_alice) = -800,
    'After paying 12.00 of 20.00, Alice should owe 8.00'
  );
  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_carol) = 800,
    'Carol should be owed 8.00'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Pending is tracked separately — this is what makes the feature work solo
-- ---------------------------------------------------------------------------
-- Alice logs an expense before Carol has confirmed anything. It must not move
-- the settled balance, but it must be visible as a projection.

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_expense uuid;
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into public.expenses (family_id, paid_by, amount_cents, description)
  values (v_family, v_alice, 4000, 'Swimming lessons')
  returning id into v_expense;

  insert into public.expense_splits (expense_id, family_id, profile_id, share_cents)
  values (v_expense, v_family, v_alice, 2000),
         (v_expense, v_family, v_carol, 2000);

  set constraints all immediate;

  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_alice) = -800,
    'A pending expense must not move the settled balance'
  );
  perform public.assert(
    (select pending_net_cents from public.family_balance(v_family)
      where profile_id = v_alice) = 2000,
    'Alice should see 20.00 pending in her favour'
  );
  perform public.assert(
    (select pending_net_cents from public.family_balance(v_family)
      where profile_id = v_carol) = -2000,
    'Carol should see 20.00 pending against her'
  );
end $$;

-- ---------------------------------------------------------------------------
-- A zero share is legal: "this one is on me"
-- ---------------------------------------------------------------------------

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_expense uuid;
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
  v_before bigint;
begin
  select confirmed_net_cents into v_before
  from public.family_balance(v_family) where profile_id = v_carol;

  insert into public.expenses (family_id, paid_by, amount_cents, description, status)
  values (v_family, v_alice, 5000, 'Birthday present, my treat', 'confirmed')
  returning id into v_expense;

  insert into public.expense_splits (expense_id, family_id, profile_id, share_cents)
  values (v_expense, v_family, v_alice, 5000),
         (v_expense, v_family, v_carol, 0);

  set constraints all immediate;

  perform public.assert(
    (select confirmed_net_cents from public.family_balance(v_family)
      where profile_id = v_carol) = v_before,
    'An expense wholly absorbed by the payer must not move the other balance'
  );
end $$;

-- ---------------------------------------------------------------------------
-- The books always balance
-- ---------------------------------------------------------------------------

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
begin
  perform public.assert(
    (select sum(confirmed_net_cents) from public.family_balance(v_family)) = 0,
    'Confirmed net positions across the family must sum to zero'
  );
  perform public.assert(
    (select sum(pending_net_cents) from public.family_balance(v_family)) = 0,
    'Pending net positions across the family must sum to zero'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Invariant: splits must reconcile with the expense total
-- ---------------------------------------------------------------------------

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_expense uuid;
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_carol uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- Shares that do not add up to the total.
  begin
    insert into public.expenses (family_id, paid_by, amount_cents, description)
    values (v_family, v_alice, 10000, 'Mismatched')
    returning id into v_expense;

    insert into public.expense_splits (expense_id, family_id, profile_id, share_cents)
    values (v_expense, v_family, v_alice, 4000),
           (v_expense, v_family, v_carol, 5000);

    set constraints all immediate;
    raise exception 'ASSERTION FAILED: splits summing to 90.00 of 100.00 were accepted';
  exception when others then
    if sqlerrm not like '%must sum to the expense total%' then raise; end if;
  end;

  -- An expense with no splits at all.
  begin
    insert into public.expenses (family_id, paid_by, amount_cents, description)
    values (v_family, v_alice, 2500, 'Orphaned');

    set constraints all immediate;
    raise exception 'ASSERTION FAILED: an expense with no splits was accepted';
  exception when others then
    if sqlerrm not like '%must sum to the expense total%' then raise; end if;
  end;

  -- Editing the amount without re-splitting.
  begin
    update public.expenses set amount_cents = 99999 where description = 'School shoes';
    set constraints all immediate;
    raise exception 'ASSERTION FAILED: an amount was edited out of sync with its splits';
  exception when others then
    if sqlerrm not like '%must sum to the expense total%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-family money is impossible by construction
-- ---------------------------------------------------------------------------

do $$
declare
  v_family uuid := (select v from public.test_ids where k = 'family_a');
  v_bob uuid := '22222222-2222-2222-2222-222222222222';
  v_expense uuid;
begin
  -- Bob is not in this family, so the composite foreign key must reject him
  -- as a payer regardless of what the application sends.
  begin
    insert into public.expenses (family_id, paid_by, amount_cents, description)
    values (v_family, v_bob, 1000, 'Cross-family');
    raise exception 'ASSERTION FAILED: an outsider was recorded as payer';
  exception when foreign_key_violation then null;
  end;
end $$;

reset role;
\echo '  Money maths: PASS'
