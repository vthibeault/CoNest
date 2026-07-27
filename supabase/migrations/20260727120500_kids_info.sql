-- Kids' Info Library: the shared source of truth for allergies, meds,
-- contacts, sizes and documents. No UI this session.
--
-- Access resolves through the child to its family via can_access_child(),
-- defined in the calendar migration.
--
-- Deliberately free-text rather than structured. "Peanuts (carries EpiPen,
-- expires March)" is what a parent actually needs to read at speed in a
-- doctor's waiting room; a normalised allergen table would be worse at that
-- job and far more tedious to fill in.

create type public.contact_kind as enum (
  'doctor',
  'dentist',
  'school',
  'childcare',
  'emergency',
  'other'
);

-- One row per child.
create table public.child_medical (
  child_id uuid primary key references public.children (id) on delete cascade,
  allergies text,
  medications text,
  conditions text,
  blood_type text,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.child_contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  kind public.contact_kind not null default 'other',
  name text not null check (length(trim(name)) between 1 and 120),
  organisation text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index child_contacts_child_idx on public.child_contacts (child_id);

-- One row per child. The thing you check in a shop, so it stays a single
-- glanceable record rather than a history.
create table public.child_sizes (
  child_id uuid primary key references public.children (id) on delete cascade,
  clothing_size text,
  shoe_size text,
  notes text,
  updated_at timestamptz not null default now()
);

-- Documents hang off the family, optionally narrowed to one child: a custody
-- agreement belongs to the family, a passport to a kid.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  child_id uuid references public.children (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  -- Path within the private `documents` bucket, not a public URL.
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_family_idx on public.documents (family_id, created_at desc);

create trigger child_medical_set_updated_at
  before update on public.child_medical
  for each row execute function public.set_updated_at();

create trigger child_contacts_set_updated_at
  before update on public.child_contacts
  for each row execute function public.set_updated_at();

create trigger child_sizes_set_updated_at
  before update on public.child_sizes
  for each row execute function public.set_updated_at();

alter table public.child_medical enable row level security;
alter table public.child_contacts enable row level security;
alter table public.child_sizes enable row level security;
alter table public.documents enable row level security;

create policy "child medical is readable by family members"
  on public.child_medical for select to authenticated
  using (public.can_access_child(child_id));

create policy "child medical is writable by family members"
  on public.child_medical for all to authenticated
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

create policy "child contacts are readable by family members"
  on public.child_contacts for select to authenticated
  using (public.can_access_child(child_id));

create policy "child contacts are writable by family members"
  on public.child_contacts for all to authenticated
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

create policy "child sizes are readable by family members"
  on public.child_sizes for select to authenticated
  using (public.can_access_child(child_id));

create policy "child sizes are writable by family members"
  on public.child_sizes for all to authenticated
  using (public.can_access_child(child_id))
  with check (public.can_access_child(child_id));

create policy "documents are readable by family members"
  on public.documents for select to authenticated
  using (public.is_family_member(family_id));

create policy "documents are writable by family members"
  on public.documents for all to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- Both buckets are private. Files are addressed as `<family_id>/<filename>`,
-- and the policies below authorise on that first path segment, so a family can
-- only ever reach its own folder. Clients must read through signed URLs.
--
-- The regex guard matters: storage.foldername() on a stray upload can return
-- something that is not a uuid, and an unguarded ::uuid cast would raise
-- instead of simply denying.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false), ('documents', 'documents', false)
on conflict (id) do nothing;

create or replace function public.storage_family_folder_ok(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce(
      (storage.foldername(p_name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      false
    )
    and public.is_family_member(((storage.foldername(p_name))[1])::uuid);
$$;

create policy "family members read their own files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('receipts', 'documents')
    and public.storage_family_folder_ok(name)
  );

create policy "family members upload to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('receipts', 'documents')
    and public.storage_family_folder_ok(name)
  );

create policy "family members update their own files"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('receipts', 'documents')
    and public.storage_family_folder_ok(name)
  )
  with check (
    bucket_id in ('receipts', 'documents')
    and public.storage_family_folder_ok(name)
  );

create policy "family members delete their own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('receipts', 'documents')
    and public.storage_family_folder_ok(name)
  );

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop policy if exists "family members delete their own files" on storage.objects;
-- drop policy if exists "family members update their own files" on storage.objects;
-- drop policy if exists "family members upload to their own folder" on storage.objects;
-- drop policy if exists "family members read their own files" on storage.objects;
-- drop function if exists public.storage_family_folder_ok(text);
-- delete from storage.buckets where id in ('receipts', 'documents');
-- drop table if exists public.documents, public.child_sizes,
--   public.child_contacts, public.child_medical cascade;
-- drop type if exists public.contact_kind;
