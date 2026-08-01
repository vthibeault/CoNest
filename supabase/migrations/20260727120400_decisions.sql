-- Decisions: "we agreed to X on this date", without it being a legal weapon.
--
-- No UI this session. Note what is deliberately absent: no immutable audit
-- trail, no tamper-evident hashing, no export-for-court. Decisions are
-- editable and deletable by either parent. That is the product thesis — this
-- is a shared memory between people who trust each other, not evidence.
--
-- Solo-first: a decision can be proposed, and even marked agreed, by one
-- parent alone. Responses are recorded if and when the other parent is there.

create type public.decision_status as enum (
  'proposed',
  'agreed',
  'declined',
  'withdrawn'
);

create type public.decision_response as enum ('agree', 'decline');

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  details text,
  proposed_by uuid not null,
  status public.decision_status not null default 'proposed',
  -- Set when the decision reaches a terminal state; this is the date the app
  -- shows as "agreed on".
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decisions_proposer_is_family_member
    foreign key (family_id, proposed_by)
    references public.family_members (family_id, profile_id)
    on delete restrict,
  -- Lets decision_responses tie back to the same family.
  unique (id, family_id)
);

create index decisions_family_idx on public.decisions (family_id, created_at desc);

create table public.decision_responses (
  decision_id uuid not null,
  family_id uuid not null,
  profile_id uuid not null,
  response public.decision_response not null,
  note text,
  responded_at timestamptz not null default now(),
  primary key (decision_id, profile_id),
  constraint responses_belong_to_decision
    foreign key (decision_id, family_id)
    references public.decisions (id, family_id)
    on delete cascade,
  constraint responses_profile_is_family_member
    foreign key (family_id, profile_id)
    references public.family_members (family_id, profile_id)
    on delete restrict
);

create trigger decisions_set_updated_at
  before update on public.decisions
  for each row execute function public.set_updated_at();

alter table public.decisions enable row level security;
alter table public.decision_responses enable row level security;

create policy "decisions are readable by family members"
  on public.decisions for select to authenticated
  using (public.is_family_member(family_id));

create policy "decisions are insertable by family members"
  on public.decisions for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "decisions are updatable by family members"
  on public.decisions for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "decisions are deletable by family members"
  on public.decisions for delete to authenticated
  using (public.is_family_member(family_id));

create policy "decision responses are readable by family members"
  on public.decision_responses for select to authenticated
  using (public.is_family_member(family_id));

-- You may only record your own response. This is the one place the app is
-- opinionated about authorship: putting words in your co-parent's mouth is
-- exactly the kind of thing that turns a cooperative tool into a contested one.
create policy "members record their own response"
  on public.decision_responses for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and profile_id = (select auth.uid())
  );

create policy "members update their own response"
  on public.decision_responses for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "members withdraw their own response"
  on public.decision_responses for delete to authenticated
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop table if exists public.decision_responses, public.decisions cascade;
-- drop type if exists public.decision_response;
-- drop type if exists public.decision_status;
