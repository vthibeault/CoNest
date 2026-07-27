import { localToInstant, parseLocalDate } from "@/lib/time";

export interface EventTimeInput {
  /** "YYYY-MM-DD" in the family's timezone. */
  date: string;
  allDay: boolean;
  /** "HH:MM", required unless allDay. */
  startTime?: string;
  /** "HH:MM". Omitted means the event is a moment rather than a span. */
  endTime?: string;
  timeZone: string;
}

/**
 * Turns what the form collected into the pair of instants stored on the row.
 *
 * Pulled out of the server action so it can be tested: it is small, it is
 * date maths, and date maths is where quiet mistakes live.
 *
 * All-day events run local midnight to 23:59 local — anchored to the family's
 * timezone, not the viewer's, so an all-day event does not slide onto the
 * neighbouring day when you check the app from another country.
 *
 * An omitted end time yields ends_at === starts_at. That is deliberate and the
 * schema allows it: a handover is an instant, not a span.
 */
export function eventInstants(input: EventTimeInput): {
  startsAt: Date;
  endsAt: Date;
} {
  const date = parseLocalDate(input.date);

  if (input.allDay) {
    return {
      startsAt: localToInstant({ ...date, hour: 0, minute: 0 }, input.timeZone),
      endsAt: localToInstant({ ...date, hour: 23, minute: 59 }, input.timeZone),
    };
  }

  if (!input.startTime) {
    throw new Error("A timed event needs a start time.");
  }

  const startsAt = localToInstant(
    { ...date, ...splitClock(input.startTime) },
    input.timeZone,
  );

  const endsAt = input.endTime
    ? localToInstant({ ...date, ...splitClock(input.endTime) }, input.timeZone)
    : startsAt;

  return { startsAt, endsAt };
}

function splitClock(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Expected a HH:MM time, got "${value}"`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`"${value}" is not a real time`);
  }
  return { hour, minute };
}
