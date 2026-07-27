-- Calendar: events, the children attached to them, and custody periods.
--
-- Custody is a separate table rather than an event type. Two reasons. It
-- answers a different question — "who has the kids right now" is a property of
-- every instant, not a thing that appears in a list — and the template
-- generator needs to bulk-replace a whole schedule without ever touching the
-- dentist appointment you typed in by hand.

create type public.event_type as enum (
  'handover',
  'appointment',
  'activity',
  'school',
  'other'
);

create type public.custody_source as enum ('template', 'manual');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  type public.event_type not null default 'other',
  title text not null check (length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Zero-length events are allowed (a handover is an instant); backwards ones
  -- are not.
  constraint events_end_after_start check (ends_at >= starts_at)
);

-- Every calendar view queries "this family, this window", so the index leads
-- with family_id and orders by start.
create index events_family_start_idx on public.events (family_id, starts_at);

create table public.event_children (
  event_id uuid not null references public.events (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  primary key (event_id, child_id)
);

create index event_children_child_idx on public.event_children (child_id);

create table public.custody_periods (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  parent_profile_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source public.custody_source not null default 'manual',
  -- Stamped on every row a single template run produces, so regenerating can
  -- replace exactly that batch and leave hand-edited periods alone.
  template_batch uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custody_end_after_start check (ends_at > starts_at),
  -- Composite FK: custody can only ever be assigned to a member of this
  -- family. Restrict rather than cascade — losing a member should not silently
  -- delete the schedule.
  constraint custody_parent_is_family_member
    foreign key (family_id, parent_profile_id)
    references public.family_members (family_id, profile_id)
    on delete restrict,
  -- The kids are in exactly one place at a time. Enforcing that here means
  -- "who has them this weekend" always has a single answer, and a botched
  -- template run fails loudly instead of quietly double-booking. Ranges are
  -- half-open, so a period ending at 09:00 and the next starting at 09:00 do
  -- not collide.
  constraint custody_periods_no_overlap
    exclude using gist (
      family_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
);

create index custody_family_start_idx on public.custody_periods (family_id, starts_at);
create index custody_batch_idx on public.custody_periods (template_batch)
  where template_batch is not null;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger custody_periods_set_updated_at
  before update on public.custody_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- event_children has no family_id of its own. Rather than denormalise one in,
-- resolve access through the parent event with definer rights, so the policy
-- does not depend on the caller also being able to select the event row.
create or replace function public.can_access_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and public.is_family_member(e.family_id)
  );
$$;

create or replace function public.can_access_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.children c
    where c.id = p_child_id
      and public.is_family_member(c.family_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_children enable row level security;
alter table public.custody_periods enable row level security;

create policy "events are readable by family members"
  on public.events for select to authenticated
  using (public.is_family_member(family_id));

create policy "events are insertable by family members"
  on public.events for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "events are updatable by family members"
  on public.events for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "events are deletable by family members"
  on public.events for delete to authenticated
  using (public.is_family_member(family_id));

-- Both sides are checked: you must reach the event *and* the child, so an
-- event cannot be linked to some other family's child.
create policy "event children are readable by family members"
  on public.event_children for select to authenticated
  using (public.can_access_event(event_id));

create policy "event children are insertable by family members"
  on public.event_children for insert to authenticated
  with check (public.can_access_event(event_id) and public.can_access_child(child_id));

create policy "event children are deletable by family members"
  on public.event_children for delete to authenticated
  using (public.can_access_event(event_id));

create policy "custody periods are readable by family members"
  on public.custody_periods for select to authenticated
  using (public.is_family_member(family_id));

create policy "custody periods are insertable by family members"
  on public.custody_periods for insert to authenticated
  with check (public.is_family_member(family_id));

create policy "custody periods are updatable by family members"
  on public.custody_periods for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "custody periods are deletable by family members"
  on public.custody_periods for delete to authenticated
  using (public.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop function if exists public.can_access_child(uuid);
-- drop function if exists public.can_access_event(uuid);
-- drop table if exists public.custody_periods, public.event_children,
--   public.events cascade;
-- drop type if exists public.custody_source;
-- drop type if exists public.event_type;
