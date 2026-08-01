"use client";

import { MapPin, Pencil, Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parentColors } from "@/lib/calendar/colors";
import {
  custodySegmentsForDay,
  dayBounds,
  eventsForDay,
  formatTime,
  monthName,
  weekdayName,
} from "@/lib/calendar/model";
import type { LocalDate } from "@/lib/time";
import type { CalendarEvent, Child, CustodyPeriod, ParentSummary } from "@/lib/types";
import { CustodyStrip } from "./custody-strip";

const TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  handover: "Handover",
  appointment: "Appointment",
  activity: "Activity",
  school: "School",
  other: "Event",
};

/** What a tapped day actually contains: custody, handovers, and events. */
export function DaySheet({
  date,
  onClose,
  timeZone,
  parents,
  events,
  eventChildren,
  custody,
  onAddEvent,
  onEditEvent,
}: {
  date: LocalDate | null;
  onClose: () => void;
  timeZone: string;
  parents: ParentSummary[];
  events: CalendarEvent[];
  eventChildren: Record<string, Child[]>;
  custody: CustodyPeriod[];
  onAddEvent: (date: LocalDate) => void;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  if (!date) return null;

  const segments = custodySegmentsForDay(custody, date, timeZone);
  const dayEvents = eventsForDay(
    events,
    new Map(Object.entries(eventChildren)),
    date,
    timeZone,
  );
  const { start, end } = dayBounds(date, timeZone);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {weekdayName(date)} {date.day} {monthName(date)}
          </DialogTitle>
          <DialogDescription>
            {segments.length === 0
              ? "No custody set for this day."
              : segments
                  .map((segment) => {
                    const parent = parents.find(
                      (p) => p.profileId === segment.parentProfileId,
                    );
                    const who = parent?.isSelf ? "You" : (parent?.displayName ?? "Someone");
                    if (!segment.startsWithHandover) return `${who} from the morning`;
                    const at = new Date(
                      start.getTime() +
                        segment.from * (end.getTime() - start.getTime()),
                    );
                    return `${who} from ${formatTime(at, timeZone)}`;
                  })
                  .join(", then ")}
          </DialogDescription>
        </DialogHeader>

        <CustodyStrip
          segments={segments}
          parents={parents}
          className="h-2.5 w-full"
        />

        {segments.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Array.from(
              new Set(segments.map((segment) => segment.parentProfileId)),
            ).map((profileId) => {
              const parent = parents.find((p) => p.profileId === profileId);
              if (!parent) return null;
              return (
                <li key={profileId} className="flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${parentColors(parent.colorSlot).solid}`}
                  />
                  <span className="text-muted-foreground">
                    {parent.isSelf ? "You" : parent.displayName}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {dayEvents.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {dayEvents.map(({ event, children }) => (
              <li key={event.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {event.all_day
                        ? "All day"
                        : formatTime(new Date(event.starts_at), timeZone)}
                    </span>
                    <span className="font-medium">{event.title}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[event.type]}</span>
                    {event.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {event.location}
                      </span>
                    ) : null}
                    {children.length > 0 ? (
                      <span>{children.map((child) => child.name).join(", ")}</span>
                    ) : null}
                  </p>
                  {event.notes ? (
                    <p className="mt-1 text-pretty text-sm text-muted-foreground">
                      {event.notes}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEditEvent(event)}
                  aria-label={`Edit ${event.title}`}
                >
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            Nothing scheduled.
          </p>
        )}

        <Button variant="outline" onClick={() => onAddEvent(date)}>
          <Plus />
          Add an event
        </Button>
      </DialogContent>
    </Dialog>
  );
}
