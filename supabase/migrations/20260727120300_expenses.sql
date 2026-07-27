-- Expenses, splits, settlements, and the derived balance.
--
-- No UI this session, but the invariants live here from the start because a
-- balance that silently drifts is the worst possible bug in this product.
--
-- Money is always integer cents. Never floats: 0.1 + 0.2 is not 0.3, and a
-- co-parenting app that is a cent off is a co-parenting app you stop trusting.
-- Currency is a family-level setting (see families.currency) rather than a
-- per-expense one; mixed-currency reconciliation needs exchange rates and a
-- policy on who eats the spread, which is not a v1 problem.

create type public.expense_status as enum ('pending', 'confirmed', 'disputed');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  paid_by uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (length(trim(description)) between 1 and 200),
  category text,
  spent_on date not null default current_date,
  -- Path within the private `receipts` storage bucket, not a public URL.
  receipt_path text,
  status public.expense_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_payer_is_family_member
    foreign key (family_id, paid_by)
    references public.family_members (family_id, profile_id)
    on delete restrict,
  -- Lets expense_splits point at (expense_id, family_id) so a split can never
  -- reference a member of a different family. See the composite FK below.
  unique (id, family_id)
);

create index expenses_family_date_idx on public.expenses (family_id, spent_on desc);

create table public.expense_splits (
  expense_id uuid not null,
  family_id uuid not null,
  profile_id uuid not null,
  -- Zero is legal: "this one is entirely on me" is a real and common split.
  share_cents bigint not null check (share_cents >= 0),
  primary key (expense_id, profile_id),
  constraint splits_belong_to_expense
    foreign key (expense_id, family_id)
    references public.expenses (id, family_id)
    on delete cascade,
  constraint splits_profile_is_family_member
    foreign key (family_id, profile_id)
    references public.family_members (family_id, profile_id)
    on delete restrict
);

create index expense_splits_profile_idx on public.expense_splits (profile_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  from_profile uuid not null,
  to_profile uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  settled_on date not null default current_date,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint settlement_parties_differ check (from_profile <> to_profile),
  constraint settlement_from_is_family_member
    foreign key (family_id, from_profile)
    references public.family_members (family_id, profile_id)
    on delete restrict,
  constraint settlement_to_is_family_member
    foreign key (family_id, to_profile)
    references public.family_members (family_id, profile_id)
    on delete restrict
);

create index settlements_family_date_idx on public.settlements (family_id, settled_on desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The splits-sum-to-total invariant
-- ---------------------------------------------------------------------------
--
-- Every balance in the app is derived from "what each person paid" minus "what
-- each person owed". That subtraction is only meaningful if the shares of an
-- expense add up to the expense. Enforced as a DEFERRABLE constraint trigger
-- so an expense and its splits can be written together in one transaction —
-- which means the Expenses layer should create them via a single RPC or an
-- explicit transaction, never as two independent round trips.

create or replace function public.check_expense_splits_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_expense_id uuid := coalesce(new.expense_id, old.expense_id);
  v_amount bigint;
  v_total bigint;
begin
  select amount_cents into v_amount
  from public.expenses where id = v_expense_id;

  -- The expense itself was deleted in this transaction; splits went with it.
  if v_amount is null then
    return null;
  end if;

  select coalesce(sum(share_cents), 0) into v_total
  from public.expense_splits where expense_id = v_expense_id;

  if v_total <> v_amount then
    raise exception
      'Expense splits must sum to the expense total (got % cents, expected %)',
      v_total, v_amount;
  end if;

  return null;
end;
$$;

create constraint trigger expense_splits_sum_matches_total
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function public.check_expense_splits_total();

-- The mirror case: an expense whose amount is edited, or one created with no
-- splits at all, must also be caught.
create or replace function public.check_expense_total_matches_splits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(share_cents), 0) into v_total
  from public.expense_splits where expense_id = new.id;

  if v_total <> new.amount_cents then
    raise exception
      'Expense splits must sum to the expense total (got % cents, expected %)',
      v_total, new.amount_cents;
  end if;

  return null;
end;
$$;

create constraint trigger expenses_total_matches_splits
  after insert or update of amount_cents on public.expenses
  deferrable initially deferred
  for each row execute function public.check_expense_total_matches_splits();

-- ---------------------------------------------------------------------------
-- Derived balance — never stored
-- ---------------------------------------------------------------------------
--
-- Returns each member's net position in cents. Positive means the rest of the
-- family owes them; negative means they owe.
--
--   net = what they paid out
--       - what they were responsible for
--       - settlements they received
--       + settlements they sent
--
-- Confirmed and pending are reported separately, and that split is what makes
-- the feature work solo. Log an expense before your co-parent has ever opened
-- the app and it sits in `pending`, so the UI can honestly say "you'd be owed
-- $40 once this is confirmed" without overstating the settled position.
-- Settlements are real money that moved, so they only ever touch the confirmed
-- figure.
--
-- SECURITY INVOKER on purpose: RLS on the underlying tables does the access
-- control, so this can never leak another family's numbers.

create or replace function public.family_balance(p_family_id uuid)
returns table (
  profile_id uuid,
  confirmed_net_cents bigint,
  pending_net_cents bigint
)
language sql
stable
set search_path = ''
as $$
  with members as (
    select fm.profile_id
    from public.family_members fm
    where fm.family_id = p_family_id
  ),
  paid as (
    select e.paid_by as profile_id,
           sum(e.amount_cents) filter (where e.status = 'confirmed') as confirmed,
           sum(e.amount_cents) filter (where e.status = 'pending') as pending
    from public.expenses e
    where e.family_id = p_family_id
    group by e.paid_by
  ),
  owed as (
    select s.profile_id,
           sum(s.share_cents) filter (where e.status = 'confirmed') as confirmed,
           sum(s.share_cents) filter (where e.status = 'pending') as pending
    from public.expense_splits s
    join public.expenses e on e.id = s.expense_id
    where e.family_id = p_family_id
    group by s.profile_id
  ),
  sent as (
    select st.from_profile as profile_id, sum(st.amount_cents) as cents
    from public.settlements st
    where st.family_id = p_family_id
    group by st.from_profile
  ),
  received as (
    select st.to_profile as profile_id, sum(st.amount_cents) as cents
    from public.settlements st
    where st.family_id = p_family_id
    group by st.to_profile
  )
  select
    m.profile_id,
    (
      coalesce(p.confirmed, 0)
      - coalesce(o.confirmed, 0)
      - coalesce(r.cents, 0)
      + coalesce(s.cents, 0)
    )::bigint,
    (coalesce(p.pending, 0) - coalesce(o.pending, 0))::bigint
  from members m
  left join paid p on p.profile_id = m.profile_id
  left join owed o on o.profile_id = m.profile_id
  left join sent s on s.profile_id = m.profile_id
  left join received r on r.profile_id = m.profile_id;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

create policy "expenses are readable by family members"
  on public.expenses for select to authenticated
  using (public.is_family_member(family_id));

create policy "expenses are insertable by family members"
  on public.expenses for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "expenses are updatable by family members"
  on public.expenses for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "expenses are deletable by family members"
  on public.expenses for delete to authenticated
  using (public.is_family_member(family_id));

create policy "expense splits are readable by family members"
  on public.expense_splits for select to authenticated
  using (public.is_family_member(family_id));

create policy "expense splits are insertable by family members"
  on public.expense_splits for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "expense splits are updatable by family members"
  on public.expense_splits for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "expense splits are deletable by family members"
  on public.expense_splits for delete to authenticated
  using (public.is_family_member(family_id));

create policy "settlements are readable by family members"
  on public.settlements for select to authenticated
  using (public.is_family_member(family_id));

create policy "settlements are insertable by family members"
  on public.settlements for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "settlements are updatable by family members"
  on public.settlements for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "settlements are deletable by family members"
  on public.settlements for delete to authenticated
  using (public.is_family_member(family_id));

grant execute on function public.family_balance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop function if exists public.family_balance(uuid);
-- drop function if exists public.check_expense_total_matches_splits();
-- drop function if exists public.check_expense_splits_total();
-- drop table if exists public.settlements, public.expense_splits,
--   public.expenses cascade;
-- drop type if exists public.expense_status;
