import { describe, expect, it } from "vitest";

import { eventInstants } from "@/lib/calendar/event-times";
import { instantToLocal } from "@/lib/time";

const LONDON = "Europe/London";
const TOKYO = "Asia/Tokyo";

describe("eventInstants", () => {
  it("anchors a timed event to the family's timezone", () => {
    const { startsAt, endsAt } = eventInstants({
      date: "2026-07-27",
      allDay: false,
      startTime: "14:30",
      endTime: "15:15",
      timeZone: LONDON,
    });

    // July, so London is on BST (UTC+1).
    expect(startsAt.toISOString()).toBe("2026-07-27T13:30:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-07-27T14:15:00.000Z");
  });

  it("uses the family's zone, not UTC, for the same wall time elsewhere", () => {
    const { startsAt } = eventInstants({
      date: "2026-07-27",
      allDay: false,
      startTime: "09:00",
      timeZone: TOKYO,
    });

    expect(startsAt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  it("treats a missing end time as a moment rather than a span", () => {
    const { startsAt, endsAt } = eventInstants({
      date: "2026-07-27",
      allDay: false,
      startTime: "09:00",
      timeZone: LONDON,
    });

    expect(endsAt.getTime()).toBe(startsAt.getTime());
  });

  /*
    The reason all-day events are anchored to the family's timezone: stored as
    UTC midnight, an all-day event would display on the previous day for anyone
    west of Greenwich and the schedule would appear to disagree with itself.
  */
  it("runs an all-day event from local midnight to local end of day", () => {
    const { startsAt, endsAt } = eventInstants({
      date: "2026-07-27",
      allDay: true,
      timeZone: LONDON,
    });

    expect(instantToLocal(startsAt, LONDON)).toMatchObject({
      year: 2026,
      month: 7,
      day: 27,
      hour: 0,
      minute: 0,
    });
    expect(instantToLocal(endsAt, LONDON)).toMatchObject({
      day: 27,
      hour: 23,
      minute: 59,
    });
  });

  it("keeps an all-day event on its own day in a zone far from UTC", () => {
    const { startsAt, endsAt } = eventInstants({
      date: "2026-07-27",
      allDay: true,
      timeZone: "America/Los_Angeles",
    });

    for (const instant of [startsAt, endsAt]) {
      expect(instantToLocal(instant, "America/Los_Angeles").day).toBe(27);
    }
  });

  it("ignores the times when the event is all day", () => {
    const withTimes = eventInstants({
      date: "2026-07-27",
      allDay: true,
      startTime: "14:00",
      endTime: "16:00",
      timeZone: LONDON,
    });
    const without = eventInstants({
      date: "2026-07-27",
      allDay: true,
      timeZone: LONDON,
    });

    expect(withTimes.startsAt.getTime()).toBe(without.startsAt.getTime());
  });

  it("resolves a time on the day the clocks change", () => {
    // 2026-03-29: BST begins at 01:00. 09:00 is unambiguous and should land
    // at 08:00 UTC, not 09:00.
    const { startsAt } = eventInstants({
      date: "2026-03-29",
      allDay: false,
      startTime: "09:00",
      timeZone: LONDON,
    });

    expect(startsAt.toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("rejects a timed event with no start time", () => {
    expect(() =>
      eventInstants({ date: "2026-07-27", allDay: false, timeZone: LONDON }),
    ).toThrow(/needs a start time/);
  });

  it("rejects malformed input rather than guessing", () => {
    expect(() =>
      eventInstants({
        date: "27/07/2026",
        allDay: true,
        timeZone: LONDON,
      }),
    ).toThrow(/YYYY-MM-DD/);

    expect(() =>
      eventInstants({
        date: "2026-07-27",
        allDay: false,
        startTime: "25:00",
        timeZone: LONDON,
      }),
    ).toThrow(/not a real time/);
  });
});
