/**
 * The shapes the calendar views render, and the maths that produces them.
 *
 * Everything is computed in the family's timezone, never the viewer's. If you
 * check the schedule from a hotel in another country, "Saturday" still means
 * Saturday at home — which is where the kids are.
 */

import {
  addDays,
  dayOfWeek,
  formatLocalDate,
  instantToLocal,
  localDateOf,
  localToInstant,
  type LocalDate,
} from "@/lib/time";
import type {
  CalendarEvent,
  Child,
  CustodyPeriod,
  ParentSummary,
} from "@/lib/types";

export type CalendarView = "month" | "week" | "agenda";

export function isCalendarView(value: string | undefined): value is CalendarView {
  return value === "month" || value === "week" || value === "agenda";
}

/** Monday-first, which is the convention nearly everywhere outside the US. */
const WEEK_STARTS_ON = 1;

export function startOfWeek(date: LocalDate): LocalDate {
  const offset = (dayOfWeek(date) - WEEK_STARTS_ON + 7) % 7;
  return addDays(date, -offset);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return { ...date, day: 1 };
}

export function addMonths(date: LocalDate, delta: number): LocalDate {
  const zeroBased = date.month - 1 + delta;
  const year = date.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  const daysInTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Clamp so that 31 January minus a month lands on 28/29 February rather than
  // rolling forward into March.
  return { year, month: month + 1, day: Math.min(date.day, daysInTarget) };
}

/** The six-week grid a month view draws, including the padding days. */
export function monthGrid(month: LocalDate): LocalDate[][] {
  const first = startOfWeek(startOfMonth(month));
  const weeks: LocalDate[][] = [];
  for (let w = 0; w < 6; w++) {
    const days: LocalDate[] = [];
    for (let d = 0; d < 7; d++) {
      days.push(addDays(first, w * 7 + d));
    }
    weeks.push(days);
  }
  return weeks;
}

export function weekGrid(date: LocalDate): LocalDate[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function dayBounds(
  date: LocalDate,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: localToInstant({ ...date, hour: 0, minute: 0 }, timeZone),
    // Midnight the following day, so DST days are 23 or 25 hours long — which
    // is exactly right, and why this is not just "start + 24h".
    end: localToInstant({ ...addDays(date, 1), hour: 0, minute: 0 }, timeZone),
  };
}

/* ---------------------------------------------------------------------------
 * Custody
 * ------------------------------------------------------------------------ */

/** A slice of one day belonging to one parent, as a fraction of that day. */
export interface CustodySegment {
  parentProfileId: string;
  /** 0 = midnight, 1 = end of day. */
  from: number;
  to: number;
  /** True when custody changes hands at this segment's start, within this day. */
  startsWithHandover: boolean;
}

/**
 * Splits a day into the parents who have the kids across it.
 *
 * Usually one segment. Two on a handover day, and the boundary between them is
 * the moment of the handover.
 */
export function custodySegmentsForDay(
  periods: CustodyPeriod[],
  date: LocalDate,
  timeZone: string,
): CustodySegment[] {
  const { start, end } = dayBounds(date, timeZone);
  const dayMs = end.getTime() - start.getTime();
  if (dayMs <= 0) return [];

  const segments: CustodySegment[] = [];

  for (const period of periods) {
    const periodStart = new Date(period.starts_at).getTime();
    const periodEnd = new Date(period.ends_at).getTime();

    const from = Math.max(periodStart, start.getTime());
    const to = Math.min(periodEnd, end.getTime());
    if (to <= from) continue;

    segments.push({
      parentProfileId: period.parent_profile_id,
      from: (from - start.getTime()) / dayMs,
      to: (to - start.getTime()) / dayMs,
      // A period beginning after midnight means the handover happened today.
      startsWithHandover: periodStart > start.getTime(),
    });
  }

  return segments.sort((a, b) => a.from - b.from);
}

/** The period covering a given instant, if any. */
export function custodyAt(
  periods: CustodyPeriod[],
  instant: Date,
): CustodyPeriod | null {
  const t = instant.getTime();
  return (
    periods.find(
      (p) =>
        new Date(p.starts_at).getTime() <= t &&
        new Date(p.ends_at).getTime() > t,
    ) ?? null
  );
}

/**
 * The headline: who has the kids now, and until when.
 *
 * This is the question the app exists to answer, so it is computed once and
 * rendered prominently rather than left for the user to read off a grid.
 */
export interface CustodyNow {
  parent: ParentSummary;
  until: Date;
  /** The parent taking over next, when the schedule reaches that far. */
  next: ParentSummary | null;
}

export function custodyNow(
  periods: CustodyPeriod[],
  parents: ParentSummary[],
  now: Date,
): CustodyNow | null {
  const current = custodyAt(periods, now);
  if (!current) return null;

  const parent = parents.find((p) => p.profileId === current.parent_profile_id);
  if (!parent) return null;

  const following = custodyAt(periods, new Date(current.ends_at));
  const next =
    parents.find((p) => p.profileId === following?.parent_profile_id) ?? null;

  return { parent, until: new Date(current.ends_at), next };
}

/* ---------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------ */

export interface PositionedEvent {
  event: CalendarEvent;
  children: Child[];
  /** Fraction of the day, for timeline placement. */
  from: number;
  to: number;
  /** The event began before this day and continues into it. */
  continuesFrom: boolean;
  continuesInto: boolean;
}

export function eventsForDay(
  events: CalendarEvent[],
  childrenByEvent: Map<string, Child[]>,
  date: LocalDate,
  timeZone: string,
): PositionedEvent[] {
  const { start, end } = dayBounds(date, timeZone);
  const dayMs = end.getTime() - start.getTime();

  return events
    .filter((event) => {
      const from = new Date(event.starts_at).getTime();
      const to = new Date(event.ends_at).getTime();

      // A handover is an instant, so its half-open range is empty and the
      // ordinary overlap test would never match it. Such events belong to the
      // single day that contains them — testing containment rather than
      // overlap, or they would leak onto every later day in the window.
      if (to === from) {
        return from >= start.getTime() && from < end.getTime();
      }

      return from < end.getTime() && to > start.getTime();
    })
    .map((event) => {
      const from = new Date(event.starts_at).getTime();
      const to = new Date(event.ends_at).getTime();
      return {
        event,
        children: childrenByEvent.get(event.id) ?? [],
        from: clamp((from - start.getTime()) / dayMs),
        to: clamp((to - start.getTime()) / dayMs),
        continuesFrom: from < start.getTime(),
        continuesInto: to > end.getTime(),
      };
    })
    .sort((a, b) => {
      if (a.event.all_day !== b.event.all_day) return a.event.all_day ? -1 : 1;
      return a.from - b.from;
    });
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------ */

export function formatTime(instant: Date, timeZone: string): string {
  const { hour, minute } = instantToLocal(instant, timeZone);
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${display}${suffix}`
    : `${display}:${String(minute).padStart(2, "0")}${suffix}`;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function weekdayName(date: LocalDate, short = false): string {
  const name = WEEKDAY_NAMES[dayOfWeek(date)];
  return short ? name.slice(0, 3) : name;
}

export function monthName(date: LocalDate, short = false): string {
  const name = MONTH_NAMES[date.month - 1];
  return short ? name.slice(0, 3) : name;
}

/** "Friday 6pm", or "Friday" when the time is midnight. */
export function describeMoment(instant: Date, timeZone: string): string {
  const local = instantToLocal(instant, timeZone);
  const date = localDateOf(instant, timeZone);
  const day = weekdayName(date);
  if (local.hour === 0 && local.minute === 0) return day;
  return `${day} ${formatTime(instant, timeZone)}`;
}

/** Relative day naming, which reads far better than a date in a headline. */
export function describeRelativeDay(
  date: LocalDate,
  today: LocalDate,
): string | null {
  if (sameDate(date, today)) return "today";
  if (sameDate(date, addDays(today, 1))) return "tomorrow";
  if (sameDate(date, addDays(today, -1))) return "yesterday";
  return null;
}

export function toDateParam(date: LocalDate): string {
  return formatLocalDate(date);
}
