import { describe, expect, it } from "vitest";

import {
  CUSTODY_TEMPLATES,
  generateCustodyPeriods,
  type CustodyTemplateId,
} from "@/lib/custody/templates";
import { instantToLocal } from "@/lib/time";

const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LONDON = "Europe/London";

function generate(
  template: CustodyTemplateId,
  overrides: Partial<Parameters<typeof generateCustodyPeriods>[0]> = {},
) {
  return generateCustodyPeriods({
    template,
    // A Monday, deliberately: the even-split patterns start on it and the
    // weekend patterns must anchor forward from it.
    startDate: "2026-01-05",
    weeks: 8,
    parentAId: ALICE,
    parentBId: BOB,
    timeZone: LONDON,
    ...overrides,
  });
}

/** Days a period spans, to one decimal. */
function lengthInDays(period: { startsAt: Date; endsAt: Date }) {
  const ms = period.endsAt.getTime() - period.startsAt.getTime();
  return Math.round((ms / 86_400_000) * 10) / 10;
}

const ALL_TEMPLATE_IDS = CUSTODY_TEMPLATES.map((t) => t.id);

describe("invariants that must hold for every template", () => {
  it.each(ALL_TEMPLATE_IDS)("%s produces a usable schedule", (id) => {
    const periods = generate(id);
    expect(periods.length).toBeGreaterThan(0);

    for (const period of periods) {
      expect(period.endsAt.getTime()).toBeGreaterThan(period.startsAt.getTime());
      expect([ALICE, BOB]).toContain(period.parentProfileId);
    }
  });

  // The database enforces this with a GiST exclusion constraint, so a generator
  // that violated it would fail at insert time. Catching it here is cheaper.
  it.each(ALL_TEMPLATE_IDS)("%s never overlaps or leaves a gap", (id) => {
    const periods = generate(id);

    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].startsAt.getTime()).toBe(
        periods[i - 1].endsAt.getTime(),
      );
    }
  });

  it.each(ALL_TEMPLATE_IDS)("%s alternates — no parent twice in a row", (id) => {
    const periods = generate(id);
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].parentProfileId).not.toBe(
        periods[i - 1].parentProfileId,
      );
    }
  });

  it.each(ALL_TEMPLATE_IDS)("%s covers exactly the requested horizon", (id) => {
    const periods = generate(id, { startDate: "2026-01-05", weeks: 4 });
    const first = periods[0];
    const last = periods[periods.length - 1];

    // Starts at midnight local on the chosen day.
    const startLocal = instantToLocal(first.startsAt, LONDON);
    expect(startLocal).toMatchObject({
      year: 2026,
      month: 1,
      day: 5,
      hour: 0,
      minute: 0,
    });

    // Ends 4 weeks later to the day.
    const endLocal = instantToLocal(last.endsAt, LONDON);
    expect(endLocal).toMatchObject({
      year: 2026,
      month: 2,
      day: 2,
      hour: 0,
      minute: 0,
    });
  });
});

/*
  A deliberate design choice worth pinning down: the schedule always opens at
  midnight on the chosen start date, not at the first handover. Starting at the
  handover would leave the hours before it with nobody assigned, and a gap in
  "who has the kids" is exactly the question this table exists to answer. The
  cost is that the first block is longer than the pattern's nominal first
  segment, which is why the cycle assertions above read rotated by one.
*/
describe("the opening block", () => {
  it("starts at midnight on the start date, with no gap before the first handover", () => {
    const periods = generate("2-2-3");
    const start = instantToLocal(periods[0].startsAt, LONDON);

    expect(start).toMatchObject({ day: 5, hour: 0, minute: 0 });
    expect(periods[0].parentProfileId).toBe(ALICE);
    // It runs right up to the first scheduled handover, never stopping short.
    expect(periods[0].endsAt.getTime()).toBe(periods[1].startsAt.getTime());
  });
});

describe("week on, week off", () => {
  it("swaps every seven days at the handover hour", () => {
    const periods = generate("week-on-week-off", { weeks: 4 });

    expect(periods[0].parentProfileId).toBe(ALICE);
    expect(periods[1].parentProfileId).toBe(BOB);

    // Slightly over a week: the schedule opens at midnight on the start date
    // and runs to the first 9am handover, so seven days plus nine hours.
    expect(lengthInDays(periods[0])).toBeCloseTo(7.4, 1);

    // Everything in the steady state is a clean week.
    for (const period of periods.slice(1, -1)) {
      expect(lengthInDays(period)).toBe(7);
    }
  });

  it("honours a custom handover hour", () => {
    const periods = generate("week-on-week-off", { handoverHour: 17 });
    const local = instantToLocal(periods[1].startsAt, LONDON);
    expect(local.hour).toBe(17);
    expect(local.minute).toBe(0);
  });
});

describe("2-2-3", () => {
  it("runs 2, 2, 3 days and mirrors in the second week", () => {
    const periods = generate("2-2-3", { weeks: 6 });
    // Read one full fortnight after the opening block. The sequence is the
    // 2-2-3 cycle rotated by one segment, because the opening block already
    // absorbed the first two days (see "the opening block" below).
    const cycle = periods.slice(1, 7).map(lengthInDays);
    expect(cycle).toEqual([2, 3, 2, 2, 3, 2]);
  });

  it("gives each parent the same total time over a fortnight", () => {
    const periods = generate("2-2-3", { weeks: 6 });
    const fortnight = periods.slice(1, 7);

    const forAlice = fortnight
      .filter((p) => p.parentProfileId === ALICE)
      .reduce((sum, p) => sum + lengthInDays(p), 0);
    const forBob = fortnight
      .filter((p) => p.parentProfileId === BOB)
      .reduce((sum, p) => sum + lengthInDays(p), 0);

    expect(forAlice).toBe(7);
    expect(forBob).toBe(7);
  });
});

describe("2-2-5-5", () => {
  it("runs 2, 2, 5, 5 days", () => {
    const periods = generate("2-2-5-5", { weeks: 6 });
    // Rotated by one segment for the same reason as 2-2-3: the opening block
    // covers the first two days.
    const cycle = periods.slice(1, 5).map(lengthInDays);
    expect(cycle).toEqual([2, 5, 5, 2]);
  });

  it("keeps each parent on the same weekdays every week", () => {
    const periods = generate("2-2-5-5", { weeks: 6 });
    // Starting Monday: Alice takes Mon/Tue, Bob takes Wed/Thu, weekends alternate.
    const second = periods[1]; // Bob's first block
    expect(second.parentProfileId).toBe(BOB);
    expect(instantToLocal(second.startsAt, LONDON).day).toBe(7); // Wednesday
  });
});

describe("every other weekend", () => {
  it("gives the weekend parent Friday evening to Sunday evening", () => {
    const periods = generate("every-other-weekend", { weeks: 6 });
    const bobs = periods.filter((p) => p.parentProfileId === BOB);

    expect(bobs.length).toBeGreaterThan(0);
    for (const period of bobs) {
      expect(lengthInDays(period)).toBe(2);
      expect(instantToLocal(period.startsAt, LONDON).hour).toBe(18);
      expect(instantToLocal(period.endsAt, LONDON).hour).toBe(18);
    }
  });

  it("skips a weekend between each visit", () => {
    const periods = generate("every-other-weekend", { weeks: 8 });
    const bobs = periods.filter((p) => p.parentProfileId === BOB);

    for (let i = 1; i < bobs.length; i++) {
      const gapDays =
        (bobs[i].startsAt.getTime() - bobs[i - 1].startsAt.getTime()) /
        86_400_000;
      expect(gapDays).toBe(14);
    }
  });

  it("anchors to the first Friday when the start date is not one", () => {
    // 2026-01-05 is a Monday; the first handover should be Friday the 9th.
    const periods = generate("every-other-weekend");
    const firstHandover = instantToLocal(periods[0].endsAt, LONDON);
    expect(firstHandover).toMatchObject({ month: 1, day: 9, hour: 18 });
  });

  it("starts immediately when the start date is already a Friday", () => {
    const periods = generate("every-other-weekend", {
      startDate: "2026-01-09",
    });
    // Midnight to 6pm with the weekday parent, then the weekend begins.
    expect(periods[0].parentProfileId).toBe(ALICE);
    expect(lengthInDays(periods[0])).toBeCloseTo(0.8, 1);
    expect(periods[1].parentProfileId).toBe(BOB);
  });

  it("leaves the weekday parent with the large majority of nights", () => {
    const periods = generate("every-other-weekend", { weeks: 8 });
    const total = (id: string) =>
      periods
        .filter((p) => p.parentProfileId === id)
        .reduce((sum, p) => sum + lengthInDays(p), 0);

    expect(total(ALICE)).toBeGreaterThan(total(BOB) * 5);
  });
});

describe("alternating weekends with a midweek overnight", () => {
  it("adds a Wednesday night every week", () => {
    const periods = generate("alternating-weekends", { weeks: 8 });
    const bobs = periods.filter((p) => p.parentProfileId === BOB);

    const overnights = bobs.filter((p) => lengthInDays(p) < 1);
    expect(overnights.length).toBeGreaterThanOrEqual(3);

    for (const night of overnights) {
      const start = instantToLocal(night.startsAt, LONDON);
      const end = instantToLocal(night.endsAt, LONDON);
      expect(start.hour).toBe(18);
      expect(end.hour).toBe(8);
    }
  });

  it("still runs weekends on a fortnightly cycle", () => {
    const periods = generate("alternating-weekends", { weeks: 8 });
    const weekends = periods.filter(
      (p) => p.parentProfileId === BOB && lengthInDays(p) === 2,
    );

    for (let i = 1; i < weekends.length; i++) {
      const gapDays =
        (weekends[i].startsAt.getTime() - weekends[i - 1].startsAt.getTime()) /
        86_400_000;
      expect(gapDays).toBe(14);
    }
  });
});

/*
  The reason localToInstant exists. Britain moves to BST on 2026-03-29, so the
  UTC offset changes mid-schedule. A generator that advanced by a fixed 24 hours
  would drift an hour and every handover after March would be wrong.
*/
describe("daylight saving", () => {
  it("keeps the handover hour fixed across a spring transition", () => {
    const periods = generate("week-on-week-off", {
      startDate: "2026-03-16",
      weeks: 6,
    });

    for (const period of periods.slice(1)) {
      expect(instantToLocal(period.startsAt, LONDON).hour).toBe(9);
    }
  });

  it("keeps the handover hour fixed across an autumn transition", () => {
    // Clocks go back on 2026-10-25.
    const periods = generate("week-on-week-off", {
      startDate: "2026-10-12",
      weeks: 6,
    });

    for (const period of periods.slice(1)) {
      expect(instantToLocal(period.startsAt, LONDON).hour).toBe(9);
    }
  });

  it("makes the week containing the transition 23 or 25 hours longer", () => {
    const periods = generate("week-on-week-off", {
      startDate: "2026-03-16",
      weeks: 6,
    });

    const spanningSpringForward = periods.find(
      (p) =>
        p.startsAt < new Date("2026-03-29T01:00:00Z") &&
        p.endsAt > new Date("2026-03-29T01:00:00Z"),
    );

    expect(spanningSpringForward).toBeDefined();
    // Seven local days, but one hour shorter in real elapsed time.
    const hours =
      (spanningSpringForward!.endsAt.getTime() -
        spanningSpringForward!.startsAt.getTime()) /
      3_600_000;
    expect(hours).toBe(7 * 24 - 1);
  });

  it("works the same in a southern-hemisphere zone", () => {
    const periods = generate("week-on-week-off", {
      startDate: "2026-09-28",
      weeks: 6,
      timeZone: "Australia/Sydney",
    });

    for (const period of periods.slice(1)) {
      expect(instantToLocal(period.startsAt, "Australia/Sydney").hour).toBe(9);
    }
  });

  it("works in a zone with no daylight saving at all", () => {
    const periods = generate("week-on-week-off", {
      timeZone: "Asia/Tokyo",
      weeks: 6,
    });

    for (const period of periods.slice(1)) {
      expect(instantToLocal(period.startsAt, "Asia/Tokyo").hour).toBe(9);
    }
  });
});

describe("input validation", () => {
  it("rejects a horizon of zero or less", () => {
    expect(() => generate("2-2-3", { weeks: 0 })).toThrow(/whole number/);
    expect(() => generate("2-2-3", { weeks: -4 })).toThrow(/whole number/);
  });

  it("rejects an absurd horizon rather than generating forever", () => {
    expect(() => generate("2-2-3", { weeks: 10_000 })).toThrow(/whole number/);
  });

  it("rejects a fractional horizon", () => {
    expect(() => generate("2-2-3", { weeks: 2.5 })).toThrow(/whole number/);
  });

  it("rejects assigning both sides to the same parent", () => {
    expect(() => generate("2-2-3", { parentBId: ALICE })).toThrow(
      /must be different/,
    );
  });

  it("rejects a malformed start date", () => {
    expect(() => generate("2-2-3", { startDate: "05/01/2026" })).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it("rejects a date that does not exist", () => {
    expect(() => generate("2-2-3", { startDate: "2026-02-30" })).toThrow(
      /not a real date/,
    );
  });

  it("rejects an out-of-range handover hour", () => {
    expect(() => generate("2-2-3", { handoverHour: 24 })).toThrow(/between/);
  });

  it("rejects an unknown template", () => {
    expect(() =>
      generate("fortnightly-ish" as CustodyTemplateId),
    ).toThrow(/Unknown custody template/);
  });
});

describe("boundary dates", () => {
  it("handles a schedule that crosses a year boundary", () => {
    const periods = generate("2-2-3", { startDate: "2026-12-21", weeks: 4 });
    expect(periods.length).toBeGreaterThan(0);
    const last = instantToLocal(periods[periods.length - 1].endsAt, LONDON);
    expect(last.year).toBe(2027);
  });

  it("handles a leap day", () => {
    const periods = generate("week-on-week-off", {
      startDate: "2028-02-21",
      weeks: 4,
    });
    const covering = periods.find(
      (p) =>
        p.startsAt <= new Date("2028-02-29T12:00:00Z") &&
        p.endsAt > new Date("2028-02-29T12:00:00Z"),
    );
    expect(covering).toBeDefined();
  });

  it("handles a start date at the very end of a month", () => {
    const periods = generate("2-2-5-5", { startDate: "2026-01-31", weeks: 4 });
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].startsAt.getTime()).toBe(periods[i - 1].endsAt.getTime());
    }
  });

  it("generates a single short schedule without falling over", () => {
    const periods = generate("week-on-week-off", { weeks: 1 });
    expect(periods.length).toBeGreaterThanOrEqual(1);
    expect(lengthInDays(periods[0])).toBeLessThanOrEqual(7);
  });
});
