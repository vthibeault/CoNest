# CoNest

A co-parenting app for cooperative separated parents. One calm source of truth
for the schedule, the money, the shared decisions and the kids' information —
across two homes.

**Status:** foundation and calendar. The full database schema exists for every
layer; only the calendar has a UI so far.

## The three principles

**Cooperative, not court-optimised.** There is deliberately no tamper-proof
message log, no court-admissible export, no immutable audit trail. Decisions
and events are editable and deletable by either parent. Records here exist for
clarity between two people who trust each other, not as evidence. Skipping the
forensic machinery is what lets this be pleasant and fast.

**Solo-first.** Every feature works with one parent in the app. You can set up
your family, log the schedule, and later log expenses and proposals entirely on
your own. The invite is always a gentle "come and see", never a prerequisite.
The expense balance reports confirmed and pending separately precisely so a
solo parent can see what they'd be owed before the co-parent ever joins.

**Layers, calendar first.** Calendar → Expenses → Decisions → Kids' Info.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth,
Storage) · installable PWA · deploys to Vercel.

## Getting started

### 1. Create a Supabase project

At [supabase.com](https://supabase.com). From **Project Settings → API**, copy
the project URL and the `anon` key.

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon
key is safe in the browser — it only grants what the RLS policies allow, which
is why those policies are the real security boundary. The service role key is
server-only and currently used by nothing but the test suite.

### 3. Apply the migrations

With the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor, in filename
order. They must run in order — later migrations depend on helpers defined in
`0001`.

### 4. Run it

```bash
npm install
npm run dev
```

Sign up, and onboarding will create your family. Your browser's timezone is
detected and stored on the family: all-day events and custody boundaries are
anchored to it, so the schedule doesn't shift when you travel.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — custody generation, calendar model, event times |
| `npm run check` | Typecheck, lint and tests together |
| `./scripts/db-test.sh` | Schema, RLS isolation and money maths against a real Postgres |

`db-test.sh` boots its own throwaway Postgres cluster and needs no Docker. It
applies `supabase/tests/00_supabase_shim.sql`, which stubs the parts of Supabase
the schema leans on (`auth.uid()`, the `auth` and `storage` schemas, and the
`anon`/`authenticated`/`service_role` grants). Those grants matter: without
them the isolation tests would pass because of a missing GRANT rather than a
working policy.

## How it is put together

```
src/
  app/
    (auth)/        sign in, sign up, magic link
    (onboarding)/  first run: create the family and children
    (app)/         the signed-in shell
      calendar/            month, week, agenda + custody setup wizard
      settings/            family, co-parent invite, sign out
    join/[code]/   invite acceptance
  lib/
    time.ts              wall-clock to instant conversion, DST-correct
    custody/templates.ts pure schedule generator
    calendar/            view model, queries, colours
    supabase/            browser, server and middleware clients
    family.ts            the signed-in user's family context
supabase/
  migrations/      the full schema, in order
  tests/           shim + RLS isolation + money maths
```

### Things worth knowing before you extend it

**Timezones.** Custody boundaries are wall-clock facts: "Friday at 6pm" means
6pm at home, in March and in July alike. Never compute a schedule by adding
fixed hours — it drifts by an hour at every DST changeover. `src/lib/time.ts`
converts local wall time to instants through `Intl`; do date arithmetic on
calendar fields and convert once, at the end.

**Custody has its own table.** Not an event type. It answers a different
question — "who has them right now" is a property of every instant — and it
lets the template generator bulk-replace a schedule without touching the
dentist appointment you typed in by hand.

**Overlapping custody is impossible.** A GiST exclusion constraint enforces it,
so "who has them this weekend" always has exactly one answer. The trade-off:
generating a schedule over dates that already have one fails loudly unless you
ask to replace them. That is the constraint doing its job.

**Money is integer cents, and balances are never stored.** `family_balance()`
derives everything from confirmed expenses minus settlements. A deferred
constraint trigger enforces that an expense's splits sum to its total, which is
what makes the subtraction meaningful — so expenses and their splits must be
written in one transaction.

**Row types are `type`, not `interface`.** supabase-js checks the schema against
`Record<string, unknown>`; interfaces have no implicit index signature, fail
that check, and silently degrade every query result to `never`. The symptom is
a baffling "Property 'id' does not exist on type 'never'".

**RLS is the security boundary.** Every family-scoped table reduces to
`is_family_member(family_id)`. `SECURITY DEFINER` functions bypass RLS, so each
one re-checks membership by hand. Run `./scripts/db-test.sh` after touching any
policy.

## What is next

Expenses. The schema, the RLS, the reconciliation function and its tests all
exist — what's missing is the UI and a `create_expense` RPC that writes an
expense and its splits in one transaction.
