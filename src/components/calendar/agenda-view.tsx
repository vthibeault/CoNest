"use client";

import { ArrowRight, MapPin } from "lucide-react";

import { addDays, type LocalDate } from "@/lib/time";
import {
  custodySegmentsForDay,
  dayBounds,
  describeRelativeDay,
  eventsForDay,
  formatTime,
  monthName,
  weekdayName,
} from "@/lib/calendar/model";
import { parentColors } from "@/lib/calendar/colors";
import type { CalendarEvent, Child, CustodyPeriod, ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const HORIZON_DAYS = 60;

/**
 * How far ahead a bare handover is worth listing.
 *
 * Handovers matter enormously in the next week or two — that is the "have I
 * got them this weekend?" question. Further out they are just the custody
 * pattern repeating, and listing every one of them for two months buries the
 * actual events under a wall of "over to Sam, 9am". Past this cutoff a day
 * has to have something on it to earn a row; the month view is the right
 * place to see the pattern itself.
 */
const HANDOVER_HORIZON_DAYS = 14;

/**
 * A chronological list of what is coming up.
 *
 * Empty days are skipped, except that a near-term handover counts as content
 * in its own right even when nobody wrote an event for it.
 */
export function AgendaView({
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
  const childrenByEvent = new Map(Object.entries(eventChildren));

  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(focus, i))
    .map((date, offset) => {
      const segments = custodySegmentsForDay(custody, date, timeZone);
      return {
        date,
        offset,
        segments,
        events: eventsForDay(events, childrenByEvent, date, timeZone),
        handover: segments.find((segment) => segment.startsWithHandover),
      };
    })
    .filter(
      (day) =>
        day.events.length > 0 ||
        (day.handover && day.offset < HANDOVER_HORIZON_DAYS),
    );

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="font-medium">Nothing coming up</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add an event, or set up a custody pattern to fill in the schedule.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {days.map((day) => {
        const relative = describeRelativeDay(day.date, today);
        const handoverTo = day.handover
          ? parents.find((p) => p.profileId === day.handover!.parentProfileId)
          : null;

        return (
          <li key={`${day.date.year}-${day.date.month}-${day.date.day}`}>
            <button
              type="button"
              onClick={() => onSelectDay(day.date)}
              className={cn(
                "flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              )}
            >
              <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-secondary py-1.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {weekdayName(day.date, true)}
                </span>
                <span className="text-lg font-semibold leading-tight tabular-nums">
                  {day.date.day}
                </span>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {monthName(day.date, true)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                {relative ? (
                  <p className="mb-1 text-xs font-medium capitalize text-primary">
                    {relative}
                  </p>
                ) : null}

                {handoverTo ? (
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm">
                    <ArrowRight
                      className={cn("size-3.5", parentColors(handoverTo.colorSlot).text)}
                    />
                    <span className="font-medium">
                      {handoverTo.isSelf
                        ? "They come to you"
                        : `Over to ${handoverTo.displayName}`}
                    </span>
                    <span className="text-muted-foreground">
                      {formatTimeFromFraction(day.date, day.handover!.from, timeZone)}
                    </span>
                  </p>
                ) : null}

                {day.events.map(({ event, children }) => (
                  <div key={event.id} className="flex items-baseline gap-2 py-0.5">
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {event.all_day
                        ? "All day"
                        : formatTime(new Date(event.starts_at), timeZone)}
                    </span>
                    <span className="min-w-0">
                      <span className="text-sm font-medium">{event.title}</span>
                      {event.location ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {event.location}
                        </span>
                      ) : null}
                      {children.length > 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {children.map((c) => c.name).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Recovers the wall-clock time of a handover from its position within the day.
 * The fraction was derived from real instants against the same bounds, so this
 * round-trips exactly — including on DST days, which are not 24 hours long.
 */
function formatTimeFromFraction(
  date: LocalDate,
  fraction: number,
  timeZone: string,
): string {
  const { start, end } = dayBounds(date, timeZone);
  const instant = new Date(
    start.getTime() + fraction * (end.getTime() - start.getTime()),
  );
  return formatTime(instant, timeZone);
}
