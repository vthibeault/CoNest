"use client";

import { MapPin } from "lucide-react";

import {
  custodySegmentsForDay,
  eventsForDay,
  formatTime,
  sameDate,
  weekGrid,
  weekdayName,
} from "@/lib/calendar/model";
import type { LocalDate } from "@/lib/time";
import type { CalendarEvent, Child, CustodyPeriod, ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CustodyStrip, describeCustody } from "./custody-strip";

/**
 * A week as seven day rows, each with a 24-hour track.
 *
 * A conventional seven-column hour grid is unreadable on a phone, and the phone
 * is where this gets used. Rows give each day room for its handover time and
 * location while still showing the shape of the day at a glance.
 */
export function WeekView({
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
  const days = weekGrid(focus);
  const childrenByEvent = new Map(Object.entries(eventChildren));

  return (
    <div className="flex flex-col gap-2">
      {days.map((date) => {
        const isToday = sameDate(date, today);
        const segments = custodySegmentsForDay(custody, date, timeZone);
        const dayEvents = eventsForDay(events, childrenByEvent, date, timeZone);

        return (
          <button
            key={`${date.year}-${date.month}-${date.day}`}
            type="button"
            onClick={() => onSelectDay(date)}
            className={cn(
              "flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">
                  {weekdayName(date, true)}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {date.day}
                </span>
                {isToday ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Today
                  </span>
                ) : null}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {describeCustody(segments, parents)}
              </span>
            </div>

            <div className="relative">
              <CustodyStrip
                segments={segments}
                parents={parents}
                className="h-2 w-full"
              />
              {/* Handover marks sit on the boundary between two segments. */}
              {segments
                .filter((segment) => segment.startsWithHandover)
                .map((segment, index) => (
                  <span
                    key={index}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
                    style={{ left: `${segment.from * 100}%` }}
                    aria-hidden="true"
                  />
                ))}
            </div>

            {dayEvents.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {dayEvents.map(({ event, children }) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        event.type === "handover"
                          ? "bg-handover"
                          : "bg-muted-foreground/60",
                      )}
                    />
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {event.all_day
                        ? "All day"
                        : formatTime(new Date(event.starts_at), timeZone)}
                    </span>
                    <span className="truncate font-medium">{event.title}</span>
                    {event.location ? (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </span>
                    ) : null}
                    {children.length > 0 ? (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {children.map((child) => child.name).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
