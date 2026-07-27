"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parentColors } from "@/lib/calendar/colors";
import {
  addMonths,
  monthName,
  toDateParam,
  weekGrid,
  type CalendarView,
} from "@/lib/calendar/model";
import { addDays, formatLocalDate, type LocalDate } from "@/lib/time";
import type { CalendarEvent, Child, CustodyPeriod, ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgendaView } from "./agenda-view";
import { CustodyBanner } from "./custody-banner";
import { DaySheet } from "./day-sheet";
import { EventDialog } from "./event-dialog";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
];

export function CalendarBoard({
  view,
  focus,
  today,
  timeZone,
  parents,
  familyChildren,
  events,
  eventChildren,
  custody,
}: {
  view: CalendarView;
  focus: LocalDate;
  today: LocalDate;
  timeZone: string;
  parents: ParentSummary[];
  familyChildren: Child[];
  events: CalendarEvent[];
  eventChildren: Record<string, Child[]>;
  custody: CustodyPeriod[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedDay, setSelectedDay] = useState<LocalDate | null>(null);
  const [composing, setComposing] = useState<LocalDate | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  function navigate(next: { view?: CalendarView; date?: LocalDate }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view) params.set("view", next.view);
    if (next.date) params.set("date", toDateParam(next.date));
    router.push(`/calendar?${params.toString()}`);
  }

  const step = view === "month" ? 0 : view === "week" ? 7 : 30;
  const previous =
    view === "month" ? addMonths(focus, -1) : addDays(focus, -step);
  const next = view === "month" ? addMonths(focus, 1) : addDays(focus, step);

  return (
    <div className="flex flex-col gap-4 py-4">
      <CustodyBanner
        custody={custody}
        parents={parents}
        timeZone={timeZone}
        now={new Date()}
      />

      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {periodLabel(view, focus)}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ date: previous })}
            aria-label={`Previous ${view === "month" ? "month" : view === "week" ? "week" : "period"}`}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ date: today })}
            disabled={formatLocalDate(focus) === formatLocalDate(today)}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ date: next })}
            aria-label={`Next ${view === "month" ? "month" : view === "week" ? "week" : "period"}`}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

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
            onClick={() => navigate({ view: option.id })}
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

      {parents.length > 1 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {parents.map((parent) => (
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
      ) : null}

      {view === "month" ? (
        <MonthView
          focus={focus}
          today={today}
          timeZone={timeZone}
          parents={parents}
          events={events}
          eventChildren={eventChildren}
          custody={custody}
          onSelectDay={setSelectedDay}
        />
      ) : null}

      {view === "week" ? (
        <WeekView
          focus={focus}
          today={today}
          timeZone={timeZone}
          parents={parents}
          events={events}
          eventChildren={eventChildren}
          custody={custody}
          onSelectDay={setSelectedDay}
        />
      ) : null}

      {view === "agenda" ? (
        <AgendaView
          focus={focus}
          today={today}
          timeZone={timeZone}
          parents={parents}
          events={events}
          eventChildren={eventChildren}
          custody={custody}
          onSelectDay={setSelectedDay}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={() => setComposing(selectedDay ?? today)}>
          <Plus />
          Add event
        </Button>
        <Button variant="outline" asChild>
          <a href="/calendar/custody-setup">
            <CalendarRange />
            Custody pattern
          </a>
        </Button>
      </div>

      <DaySheet
        date={selectedDay}
        onClose={() => setSelectedDay(null)}
        timeZone={timeZone}
        parents={parents}
        events={events}
        eventChildren={eventChildren}
        custody={custody}
        onAddEvent={(date) => {
          setSelectedDay(null);
          setComposing(date);
        }}
        onEditEvent={(event) => {
          setSelectedDay(null);
          setEditing(event);
        }}
      />

      <EventDialog
        // Remounts the form when the target changes, so its initial state is
        // always seeded from the right event.
        key={editing?.id ?? (composing ? toDateParam(composing) : "new")}
        open={composing !== null || editing !== null}
        onClose={() => {
          setComposing(null);
          setEditing(null);
        }}
        date={composing}
        event={editing}
        timeZone={timeZone}
        familyChildren={familyChildren}
        eventChildren={editing ? (eventChildren[editing.id] ?? []) : []}
      />
    </div>
  );
}

function periodLabel(view: CalendarView, focus: LocalDate): string {
  if (view === "month") return `${monthName(focus)} ${focus.year}`;

  if (view === "week") {
    const days = weekGrid(focus);
    const start = days[0];
    const end = days[6];
    if (start.month === end.month) {
      return `${start.day}–${end.day} ${monthName(start, true)}`;
    }
    return `${start.day} ${monthName(start, true)} – ${end.day} ${monthName(end, true)}`;
  }

  return "Coming up";
}
