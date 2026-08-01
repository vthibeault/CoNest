"use client";

import { useState } from "react";

import { Wordmark } from "@/components/brand";
import { AgendaView } from "@/components/calendar/agenda-view";
import { CustodyBanner } from "@/components/calendar/custody-banner";
import { DaySheet } from "@/components/calendar/day-sheet";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { parentColors } from "@/lib/calendar/colors";
import { generateCustodyPeriods } from "@/lib/custody/templates";
import { localToInstant, type LocalDate } from "@/lib/time";
import type {
  CalendarEvent,
  Child,
  CustodyPeriod,
  ParentSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/*
  Static UI preview of the calendar.

  GitHub Pages serves static files, and CoNest is server-rendered — middleware,
  server actions, cookie-backed sessions. None of that can run here. So this
  page renders the real calendar components against fixed sample data, with no
  database and no network.

  Everything is deterministic and pinned to a fixed "today". Using the real
  current date would make the prerendered HTML disagree with what the browser
  renders, and would quietly change the preview from one deploy to the next.

  Deliberately omitted: creating and editing events. Those go through server
  actions that cannot exist on a static host, and a button that throws is
  worse than no button.
*/

const TIME_ZONE = "Europe/London";
const TODAY: LocalDate = { year: 2026, month: 7, day: 27 };

const ALEX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PARENTS: ParentSummary[] = [
  { profileId: ALEX, displayName: "Alex", colorSlot: "a", isSelf: true },
  { profileId: SAM, displayName: "Sam", colorSlot: "b", isSelf: false },
];

const CHILDREN: Child[] = [
  {
    id: "child-ellie",
    family_id: "family",
    name: "Ellie",
    birthdate: "2018-04-02",
    created_at: "",
    updated_at: "",
  },
  {
    id: "child-theo",
    family_id: "family",
    name: "Theo",
    birthdate: "2020-09-14",
    created_at: "",
    updated_at: "",
  },
];

/** Wall-clock helper so sample times read the same as they would in the app. */
function at(day: number, hour: number, minute = 0, month = 7): string {
  return localToInstant(
    { year: 2026, month, day, hour, minute },
    TIME_ZONE,
  ).toISOString();
}

const CUSTODY: CustodyPeriod[] = generateCustodyPeriods({
  template: "2-2-3",
  startDate: "2026-07-06",
  weeks: 10,
  parentAId: ALEX,
  parentBId: SAM,
  timeZone: TIME_ZONE,
  handoverHour: 9,
}).map((period, index) => ({
  id: `custody-${index}`,
  family_id: "family",
  parent_profile_id: period.parentProfileId,
  starts_at: period.startsAt.toISOString(),
  ends_at: period.endsAt.toISOString(),
  source: "template",
  template_batch: "sample",
  note: null,
  created_at: "",
  updated_at: "",
}));

function event(
  id: string,
  type: CalendarEvent["type"],
  title: string,
  starts: string,
  ends: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    family_id: "family",
    type,
    title,
    starts_at: starts,
    ends_at: ends,
    all_day: false,
    location: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

const EVENTS: CalendarEvent[] = [
  event("e1", "handover", "Handover at the swings", at(28, 9), at(28, 9), {
    location: "Victoria Park gate",
  }),
  event("e2", "appointment", "Dentist — Ellie", at(28, 14, 30), at(28, 15, 15), {
    location: "Bridge Street Dental",
    notes: "Bring the referral letter",
  }),
  event("e3", "activity", "Football practice", at(29, 17), at(29, 18, 30)),
  event("e4", "activity", "Theo's swimming", at(30, 10), at(30, 11), {
    location: "Leisure centre",
  }),
  event("e5", "school", "INSET day — no school", at(31, 0), at(31, 23, 59), {
    all_day: true,
  }),
  event(
    "e6",
    "appointment",
    "Parents' evening",
    at(3, 18, 0, 8),
    at(3, 19, 0, 8),
  ),
];

const EVENT_CHILDREN: Record<string, Child[]> = {
  e2: [CHILDREN[0]],
  e4: [CHILDREN[1]],
  e6: [CHILDREN[0], CHILDREN[1]],
};

// Fixed instant inside the sample schedule, so the banner always has an answer.
const NOW = new Date(at(27, 15));

const VIEWS = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export default function PreviewPage() {
  const [view, setView] = useState<ViewId>("month");
  const [selectedDay, setSelectedDay] = useState<LocalDate | null>(null);

  const shared = {
    focus: TODAY,
    today: TODAY,
    timeZone: TIME_ZONE,
    parents: PARENTS,
    events: EVENTS,
    eventChildren: EVENT_CHILDREN,
    custody: CUSTODY,
    onSelectDay: setSelectedDay,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-3">
        <Wordmark className="text-lg" />
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-4">
          <p className="text-sm font-medium">UI preview</p>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            The real calendar components rendered with sample data, on a fixed
            date. There is no database behind this page, so creating and editing
            events is not available here — tap a day to see its detail sheet.
          </p>
        </div>
      </header>

      <CustodyBanner
        custody={CUSTODY}
        parents={PARENTS}
        timeZone={TIME_ZONE}
        now={NOW}
      />

      <div
        role="tablist"
        aria-label="Calendar view"
        className="inline-flex self-start rounded-full bg-secondary p-1"
      >
        {VIEWS.map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={view === option.id}
            onClick={() => setView(option.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === option.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {PARENTS.map((parent) => (
          <li key={parent.profileId} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2.5 rounded-full",
                parentColors(parent.colorSlot).solid,
              )}
            />
            <span className="text-muted-foreground">
              {parent.isSelf ? "You" : parent.displayName}
            </span>
          </li>
        ))}
      </ul>

      {view === "month" ? <MonthView {...shared} /> : null}
      {view === "week" ? <WeekView {...shared} /> : null}
      {view === "agenda" ? <AgendaView {...shared} /> : null}

      <DaySheet
        date={selectedDay}
        onClose={() => setSelectedDay(null)}
        timeZone={TIME_ZONE}
        parents={PARENTS}
        events={EVENTS}
        eventChildren={EVENT_CHILDREN}
        custody={CUSTODY}
        // Editing needs a server; the sheet simply closes instead.
        onAddEvent={() => setSelectedDay(null)}
        onEditEvent={() => setSelectedDay(null)}
      />

      <footer className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        Static preview built from the repository. The working app is
        server-rendered and needs a Supabase project — see the README.
      </footer>
    </div>
  );
}
