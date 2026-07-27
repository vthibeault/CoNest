import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CalendarBoard } from "@/components/calendar/calendar-board";
import { getFamilyContext } from "@/lib/family";
import { loadCalendarData } from "@/lib/calendar/queries";
import {
  dayBounds,
  isCalendarView,
  monthGrid,
  startOfMonth,
  weekGrid,
  type CalendarView,
} from "@/lib/calendar/model";
import {
  addDays,
  localDateOf,
  parseLocalDate,
  type LocalDate,
} from "@/lib/time";
import type { Child } from "@/lib/types";

export const metadata: Metadata = { title: "Calendar · CoNest" };

/** How far ahead the agenda looks. */
const AGENDA_DAYS = 60;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const context = await getFamilyContext();
  if (!context) redirect("/welcome");

  const { family, parents, children } = context;
  const timeZone = family.timezone;
  const today = localDateOf(new Date(), timeZone);

  const params = await searchParams;
  const view: CalendarView = isCalendarView(params.view) ? params.view : "month";
  const focus = safeDate(params.date, today);

  // Fetch exactly what the chosen view draws — including the padding days a
  // month grid shows from the neighbouring months.
  const { from, to } = rangeFor(view, focus, timeZone);
  const { events, childrenByEvent, custody } = await loadCalendarData(from, to);

  return (
    <CalendarBoard
      view={view}
      focus={focus}
      today={today}
      timeZone={timeZone}
      parents={parents}
      familyChildren={children}
      events={events}
      eventChildren={serialiseChildren(childrenByEvent)}
      custody={custody}
    />
  );
}

function safeDate(value: string | undefined, fallback: LocalDate): LocalDate {
  if (!value) return fallback;
  try {
    return parseLocalDate(value);
  } catch {
    // A malformed ?date= should land on today rather than throw a 500.
    return fallback;
  }
}

function rangeFor(view: CalendarView, focus: LocalDate, timeZone: string) {
  if (view === "month") {
    const weeks = monthGrid(startOfMonth(focus));
    return {
      from: dayBounds(weeks[0][0], timeZone).start,
      to: dayBounds(weeks[weeks.length - 1][6], timeZone).end,
    };
  }

  if (view === "week") {
    const days = weekGrid(focus);
    return {
      from: dayBounds(days[0], timeZone).start,
      to: dayBounds(days[6], timeZone).end,
    };
  }

  return {
    from: dayBounds(focus, timeZone).start,
    to: dayBounds(addDays(focus, AGENDA_DAYS), timeZone).end,
  };
}

/** Maps are not serialisable across the server/client boundary. */
function serialiseChildren(map: Map<string, Child[]>): Record<string, Child[]> {
  return Object.fromEntries(map);
}
