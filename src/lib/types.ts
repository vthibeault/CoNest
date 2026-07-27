/**
 * Database types.
 *
 * Hand-written to match supabase/migrations. Once you have a live project you
 * can regenerate this instead, which is the better long-term habit:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types.ts
 *
 * Tables without UI yet (expenses, decisions, kids' info) are typed here too,
 * so the next layers start with the shapes already in place.
 *
 * Every row shape below is a `type`, never an `interface`, and that is load
 * bearing. supabase-js checks this schema against Record<string, unknown>;
 * interfaces do not get an implicit index signature, so they fail that check
 * and the client silently degrades every query result to `never`. The symptom
 * is baffling — "Property 'id' does not exist on type 'never'" on ordinary
 * selects — so keep these as type aliases.
 */

export type EventType =
  | "handover"
  | "appointment"
  | "activity"
  | "school"
  | "other";

export type CustodySource = "template" | "manual";
export type ExpenseStatus = "pending" | "confirmed" | "disputed";
export type DecisionStatus = "proposed" | "agreed" | "declined" | "withdrawn";
export type DecisionResponseValue = "agree" | "decline";
export type ContactKind =
  | "doctor"
  | "dentist"
  | "school"
  | "childcare"
  | "emergency"
  | "other";

/** Colour slot within a family; drives the custody colours. */
export type ColorSlot = "a" | "b" | "c" | "d";

export type Family = {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  created_by: string;
  created_at: string;
}

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export type FamilyMember = {
  family_id: string;
  profile_id: string;
  role: "parent";
  color_slot: ColorSlot;
  joined_at: string;
}

export type Child = {
  id: string;
  family_id: string;
  name: string;
  birthdate: string | null;
  created_at: string;
  updated_at: string;
}

export type Invite = {
  id: string;
  family_id: string;
  code: string;
  invited_email: string | null;
  status: "pending" | "accepted" | "revoked";
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
}

export type CalendarEvent = {
  id: string;
  family_id: string;
  type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EventChild = {
  event_id: string;
  child_id: string;
}

export type CustodyPeriod = {
  id: string;
  family_id: string;
  parent_profile_id: string;
  starts_at: string;
  ends_at: string;
  source: CustodySource;
  template_batch: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type Expense = {
  id: string;
  family_id: string;
  paid_by: string;
  amount_cents: number;
  description: string;
  category: string | null;
  spent_on: string;
  receipt_path: string | null;
  status: ExpenseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseSplit = {
  expense_id: string;
  family_id: string;
  profile_id: string;
  share_cents: number;
}

export type Settlement = {
  id: string;
  family_id: string;
  from_profile: string;
  to_profile: string;
  amount_cents: number;
  settled_on: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type Decision = {
  id: string;
  family_id: string;
  title: string;
  details: string | null;
  proposed_by: string;
  status: DecisionStatus;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DecisionResponse = {
  decision_id: string;
  family_id: string;
  profile_id: string;
  response: DecisionResponseValue;
  note: string | null;
  responded_at: string;
}

/** Row shape returned by the family_balance() function. */
export type FamilyBalanceRow = {
  profile_id: string;
  confirmed_net_cents: number;
  pending_net_cents: number;
}

type Row<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      families: Row<Family>;
      profiles: Row<Profile>;
      family_members: Row<FamilyMember>;
      children: Row<Child>;
      invites: Row<Invite>;
      events: Row<CalendarEvent>;
      event_children: Row<EventChild>;
      custody_periods: Row<CustodyPeriod>;
      expenses: Row<Expense>;
      expense_splits: Row<ExpenseSplit>;
      settlements: Row<Settlement>;
      decisions: Row<Decision>;
      decision_responses: Row<DecisionResponse>;
    };
    // Must keep a string index signature: supabase-js checks this schema
    // against Record<string, ...>, and an empty object literal fails that
    // constraint, quietly degrading every query's types to `never`.
    Views: Record<string, never>;
    Functions: {
      create_family: {
        Args: { p_name: string; p_timezone?: string; p_currency?: string };
        Returns: string;
      };
      create_invite: {
        Args: { p_family_id: string; p_invited_email?: string | null };
        Returns: Invite;
      };
      accept_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      family_balance: {
        Args: { p_family_id: string };
        Returns: FamilyBalanceRow[];
      };
    };
    Enums: {
      event_type: EventType;
      custody_source: CustodySource;
      expense_status: ExpenseStatus;
      decision_status: DecisionStatus;
      decision_response: DecisionResponseValue;
      contact_kind: ContactKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* ---------------------------------------------------------------------------
 * View models — what the calendar actually renders.
 * ------------------------------------------------------------------------ */

/** A parent as the calendar needs them: identity plus their colour. */
export type ParentSummary = {
  profileId: string;
  displayName: string;
  colorSlot: ColorSlot;
  isSelf: boolean;
}

export type EventWithChildren = CalendarEvent & {
  children: Child[];
};
