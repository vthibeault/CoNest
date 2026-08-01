/**
 * Timezone helpers.
 *
 * Custody boundaries are wall-clock facts: "Friday at 6pm" means 6pm where the
 * family lives, in March and in July alike. Storing instants is right, but
 * computing them by adding fixed hours is wrong — it drifts by an hour at every
 * DST changeover, and a schedule that silently shifts is worse than no schedule.
 *
 * So all date arithmetic here happens on local calendar fields, and conversion
 * to an instant happens once, at the end, through the IANA zone. Intl does the
 * heavy lifting, which keeps this dependency-free.
 */

/** A wall-clock date and time, with no timezone attached. */
export interface LocalDateTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
}

/** A calendar date with no time or timezone. */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

/**
 * How far the given zone sits from UTC at a particular instant, in ms.
 * Positive east of Greenwich.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as "24" in some locales/engines under hour12:false.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - instant.getTime();
}

/**
 * Resolves a wall-clock time in a zone to the instant it refers to.
 *
 * Two passes: guess using the offset at the naive instant, then re-evaluate at
 * that guess. The second pass is what gets DST changeover days right, where the
 * offset before and after the transition differ. Times that do not exist
 * (inside a spring-forward gap) resolve to the instant the clock jumps to.
 */
export function localToInstant(local: LocalDateTime, timeZone: string): Date {
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );

  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const settled = naive - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(settled);
}

/** Renders an instant as wall-clock fields in the given zone. */
export function instantToLocal(instant: Date, timeZone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/**
 * Calendar arithmetic on a bare date. Deliberately timezone-free: adding a day
 * to the 30th is a fact about calendars, not about clocks, and keeping it that
 * way is what stops DST leaking into the day count.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Day of week for a bare date. 0 = Sunday, 5 = Friday. */
export function dayOfWeek(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Parses "YYYY-MM-DD". Throws rather than silently yielding Invalid Date. */
export function parseLocalDate(iso: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    throw new Error(`Expected a YYYY-MM-DD date, got "${iso}"`);
  }
  const [, year, month, day] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  // Rejects 2026-02-30 and friends, which Date would happily roll over.
  const roundTrip = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  );
  if (
    roundTrip.getUTCFullYear() !== parsed.year ||
    roundTrip.getUTCMonth() + 1 !== parsed.month ||
    roundTrip.getUTCDate() !== parsed.day
  ) {
    throw new Error(`"${iso}" is not a real date`);
  }
  return parsed;
}

/** Formats a bare date back to "YYYY-MM-DD". */
export function formatLocalDate(date: LocalDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** The date portion of an instant, as seen in the given zone. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const { year, month, day } = instantToLocal(instant, timeZone);
  return { year, month, day };
}

/** Falls back to UTC when the browser gives us something unusable. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
