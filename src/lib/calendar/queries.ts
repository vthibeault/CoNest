import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Child, CustodyPeriod } from "@/lib/types";

export interface CalendarData {
  events: CalendarEvent[];
  /** Children attached to each event, keyed by event id. */
  childrenByEvent: Map<string, Child[]>;
  custody: CustodyPeriod[];
}

/**
 * Loads everything in a window, in one round trip per table.
 *
 * The overlap test is deliberately `starts_at < to AND ends_at >= from` rather
 * than "starts within the window": a custody block running Friday to the
 * following Wednesday has to appear on Monday too, and a naive filter would
 * leave that day looking unassigned.
 *
 * No family_id filter is needed — RLS already restricts these tables to the
 * caller's family, and adding one would only be a second chance to get it wrong.
 */
export async function loadCalendarData(
  from: Date,
  to: Date,
): Promise<CalendarData> {
  const supabase = await createClient();

  const [eventsResult, custodyResult] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .lt("starts_at", to.toISOString())
      .gte("ends_at", from.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("custody_periods")
      .select("*")
      .lt("starts_at", to.toISOString())
      .gte("ends_at", from.toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (custodyResult.error) throw custodyResult.error;

  const events = eventsResult.data ?? [];
  const childrenByEvent = new Map<string, Child[]>();

  if (events.length > 0) {
    const { data, error } = await supabase
      .from("event_children")
      .select("event_id, children(*)")
      .in(
        "event_id",
        events.map((event) => event.id),
      );

    if (error) throw error;

    type Link = {
      event_id: string;
      children: Child | Child[] | null;
    };

    for (const link of (data ?? []) as unknown as Link[]) {
      const child = Array.isArray(link.children)
        ? link.children[0]
        : link.children;
      if (!child) continue;
      const existing = childrenByEvent.get(link.event_id);
      if (existing) existing.push(child);
      else childrenByEvent.set(link.event_id, [child]);
    }
  }

  return { events, childrenByEvent, custody: custodyResult.data ?? [] };
}
