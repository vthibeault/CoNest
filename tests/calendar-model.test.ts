import { describe, expect, it } from "vitest";

import {
  addMonths,
  custodySegmentsForDay,
  dayBounds,
  eventsForDay,
  monthGrid,
  startOfWeek,
} from "@/lib/calendar/model";
import { localToInstant, type LocalDate } from "@/lib/time";
import type { CalendarEvent, CustodyPeriod } from "@/lib/types";

const TZ = "Europe/London";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const day = (y: number, m: number, d: number): LocalDate => ({
  year: y,
  month: m,
  day: d,
});

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    family_id: "f",
    type: "other",
    title: "Something",
    starts_at: "2026-07-27T09:00:00Z",
    ends_at: "2026-07-27T10:00:00Z",
    all_day: false,
    location: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function custody(
  parent: string,
  startsAt: string,
  endsAt: string,
): CustodyPeriod {
  return {
    id: `${parent}-${startsAt}`,
    family_id: "f",
    parent_profile_id: parent,
    starts_at: startsAt,
    ends_at: endsAt,
    source: "template",
    template_batch: null,
    note: null,
    created_at: "",
    updated_at: "",
  };
}

describe("eventsForDay", () => {
  /*
    Regression: a handover is stored with ends_at == starts_at, so its
    half-open range is empty and an overlap test never matches it. An earlier
    version special-cased that by accepting any zero-length event whose start
    was before the end of the day — which put a single handover on every
    subsequent day in the window. Caught by looking at the rendered week.
  */
  it("puts a zero-length event on exactly one day", () => {
    const instant = localToInstant(
      { ...day(2026, 7, 27), hour: 9, minute: 0 },
      TZ,
    );
    const handover = event({
      type: "handover",
      starts_at: instant.toISOString(),
      ends_at: instant.toISOString(),
    });

    expect(
      eventsForDay([handover], new Map(), day(2026, 7, 27), TZ),
    ).toHaveLength(1);

    for (const other of [day(2026, 7, 26), day(2026, 7, 28), day(2026, 8, 4)]) {
      expect(eventsForDay([handover], new Map(), other, TZ)).toHaveLength(0);
    }
  });

  it("shows a multi-day event on every day it covers, and no others", () => {
    const trip = event({
      starts_at: localToInstant(
        { ...day(2026, 7, 27), hour: 18, minute: 0 },
        TZ,
      ).toISOString(),
      ends_at: localToInstant(
        { ...day(2026, 7, 30), hour: 12, minute: 0 },
        TZ,
      ).toISOString(),
    });

    for (const d of [27, 28, 29, 30]) {
      expect(eventsForDay([trip], new Map(), day(2026, 7, d), TZ)).toHaveLength(1);
    }
    expect(eventsForDay([trip], new Map(), day(2026, 7, 26), TZ)).toHaveLength(0);
    expect(eventsForDay([trip], new Map(), day(2026, 7, 31), TZ)).toHaveLength(0);
  });

  it("does not bleed an event into the following day when it ends at midnight", () => {
    const evening = event({
      starts_at: localToInstant(
        { ...day(2026, 7, 27), hour: 20, minute: 0 },
        TZ,
      ).toISOString(),
      ends_at: localToInstant(
        { ...day(2026, 7, 28), hour: 0, minute: 0 },
        TZ,
      ).toISOString(),
    });

    expect(eventsForDay([evening], new Map(), day(2026, 7, 27), TZ)).toHaveLength(1);
    expect(eventsForDay([evening], new Map(), day(2026, 7, 28), TZ)).toHaveLength(0);
  });

  it("sorts all-day events first, then by start time", () => {
    const allDay = event({ id: "a", all_day: true });
    const late = event({
      id: "late",
      starts_at: localToInstant({ ...day(2026, 7, 27), hour: 17, minute: 0 }, TZ).toISOString(),
      ends_at: localToInstant({ ...day(2026, 7, 27), hour: 18, minute: 0 }, TZ).toISOString(),
    });
    const early = event({
      id: "early",
      starts_at: localToInstant({ ...day(2026, 7, 27), hour: 8, minute: 0 }, TZ).toISOString(),
      ends_at: localToInstant({ ...day(2026, 7, 27), hour: 9, minute: 0 }, TZ).toISOString(),
    });

    const ordered = eventsForDay(
      [late, allDay, early],
      new Map(),
      day(2026, 7, 27),
      TZ,
    ).map((positioned) => positioned.event.id);

    expect(ordered).toEqual(["a", "early", "late"]);
  });
});

describe("custodySegmentsForDay", () => {
  it("returns one full-width segment for an uninterrupted day", () => {
    const periods = [
      custody(ALICE, "2026-07-20T08:00:00Z", "2026-07-30T08:00:00Z"),
    ];
    const segments = custodySegmentsForDay(periods, day(2026, 7, 25), TZ);

    expect(segments).toHaveLength(1);
    expect(segments[0].parentProfileId).toBe(ALICE);
    expect(segments[0].from).toBe(0);
    expect(segments[0].to).toBe(1);
    expect(segments[0].startsWithHandover).toBe(false);
  });

  it("splits a handover day at the moment of the handover", () => {
    const noon = localToInstant({ ...day(2026, 7, 25), hour: 12, minute: 0 }, TZ);
    const periods = [
      custody(ALICE, "2026-07-20T08:00:00Z", noon.toISOString()),
      custody(BOB, noon.toISOString(), "2026-07-30T08:00:00Z"),
    ];

    const segments = custodySegmentsForDay(periods, day(2026, 7, 25), TZ);

    expect(segments).toHaveLength(2);
    expect(segments[0].parentProfileId).toBe(ALICE);
    expect(segments[0].startsWithHandover).toBe(false);
    expect(segments[1].parentProfileId).toBe(BOB);
    expect(segments[1].startsWithHandover).toBe(true);
    // Midday, and the two halves meet exactly.
    expect(segments[0].to).toBeCloseTo(0.5, 5);
    expect(segments[1].from).toBeCloseTo(0.5, 5);
    expect(segments[1].to).toBe(1);
  });

  it("returns nothing for a day with no custody set", () => {
    expect(custodySegmentsForDay([], day(2026, 7, 25), TZ)).toEqual([]);
  });

  it("measures fractions against the real length of a DST day", () => {
    // 25 October 2026: clocks go back, so this day is 25 hours long. A
    // handover at noon therefore sits slightly past the halfway point.
    const noon = localToInstant(
      { ...day(2026, 10, 25), hour: 12, minute: 0 },
      TZ,
    );
    const periods = [
      custody(ALICE, "2026-10-20T08:00:00Z", noon.toISOString()),
      custody(BOB, noon.toISOString(), "2026-10-30T08:00:00Z"),
    ];

    const { start, end } = dayBounds(day(2026, 10, 25), TZ);
    expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000);

    const segments = custodySegmentsForDay(periods, day(2026, 10, 25), TZ);
    expect(segments[1].from).toBeCloseTo(13 / 25, 5);
  });
});

describe("grid helpers", () => {
  it("starts weeks on Monday", () => {
    // 2026-07-27 is a Monday; 2026-07-26 is the Sunday before.
    expect(startOfWeek(day(2026, 7, 27))).toEqual(day(2026, 7, 27));
    expect(startOfWeek(day(2026, 7, 26))).toEqual(day(2026, 7, 20));
  });

  it("builds a six-week grid that brackets the month", () => {
    const weeks = monthGrid(day(2026, 7, 1));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // July 2026 starts on a Wednesday, so the grid opens on 29 June.
    expect(weeks[0][0]).toEqual(day(2026, 6, 29));
  });

  it("clamps the day when a month is too short", () => {
    expect(addMonths(day(2026, 1, 31), 1)).toEqual(day(2026, 2, 28));
    expect(addMonths(day(2028, 1, 31), 1)).toEqual(day(2028, 2, 29));
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths(day(2026, 12, 15), 1)).toEqual(day(2027, 1, 15));
    expect(addMonths(day(2026, 1, 15), -1)).toEqual(day(2025, 12, 15));
    expect(addMonths(day(2026, 6, 15), -18)).toEqual(day(2024, 12, 15));
  });
});
