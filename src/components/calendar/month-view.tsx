"use client";

import {
  custodySegmentsForDay,
  eventsForDay,
  monthGrid,
  sameDate,
  startOfMonth,
  weekdayName,
} from "@/lib/calendar/model";
import type { LocalDate } from "@/lib/time";
import type { CalendarEvent, Child, CustodyPeriod, ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CustodyStrip, describeCustody } from "./custody-strip";

const WEEKDAY_HEADERS = (() => {
  // Monday-first, taken from a known Monday so the labels cannot drift.
  const monday: LocalDate = { year: 2024, month: 1, day: 1 };
  return Array.from({ length: 7 }, (_, i) => {
    const date = { ...monday, day: monday.day + i };
    return weekdayName(date, true);
  });
})();

export function MonthView({
  focus,
  today,
  timeZone,
  parents,
  events,
  eventChildren,
  custody,
  onSelectDay,
}: {
  focus: LocalDate;
  today: LocalDate;
  timeZone: string;
  parents: ParentSummary[];
  events: CalendarEvent[];
  eventChildren: Record<string, Child[]>;
  custody: CustodyPeriod[];
  onSelectDay: (date: LocalDate) => void;
}) {
  const weeks = monthGrid(startOfMonth(focus));
  const childrenByEvent = new Map(Object.entries(eventChildren));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 px-0.5 pb-2">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label.slice(0, 1)}
            <span className="sr-only">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((date) => {
          const inMonth = date.month === focus.month;
          const isToday = sameDate(date, today);
          const segments = custodySegmentsForDay(custody, date, timeZone);
          const dayEvents = eventsForDay(
            events,
            childrenByEvent,
            date,
            timeZone,
          );

          return (
            <button
              key={`${date.year}-${date.month}-${date.day}`}
              type="button"
              onClick={() => onSelectDay(date)}
              aria-label={`${date.day} ${weekdayName(date)} — ${describeCustody(segments, parents)}${
                dayEvents.length
                  ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}`
                  : ""
              }`}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                inMonth
                  ? "border-border bg-card hover:bg-accent"
                  : "border-transparent bg-transparent hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center self-start rounded-full text-sm tabular-nums",
                  isToday && "bg-primary font-semibold text-primary-foreground",
                  !isToday && !inMonth && "text-muted-foreground/60",
                  !isToday && inMonth && "font-medium",
                )}
              >
                {date.day}
              </span>

              <CustodyStrip
                segments={segments}
                parents={parents}
                className={cn("h-1.5 w-full", !inMonth && "opacity-40")}
              />

              {dayEvents.length > 0 ? (
                <span className="flex flex-wrap gap-0.5">
                  {dayEvents.slice(0, 3).map((positioned) => (
                    <span
                      key={positioned.event.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        positioned.event.type === "handover"
                          ? "bg-handover"
                          : "bg-muted-foreground/60",
                      )}
                    />
                  ))}
                  {dayEvents.length > 3 ? (
                    <span className="text-[10px] leading-none text-muted-foreground">
                      +{dayEvents.length - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
