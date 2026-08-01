/**
 * Custody schedule generation.
 *
 * Pure functions: in go a template, a start date and a horizon; out come
 * contiguous, non-overlapping periods. Nothing here touches the database or the
 * clock, which is what makes the whole thing testable — and this is the one
 * piece of logic in the calendar where a silent bug quietly corrupts a real
 * family's schedule rather than just looking wrong.
 *
 * Every template is expressed as a repeating cycle of *transitions*. A
 * transition says "from this wall-clock moment, this parent has the kids",
 * and a period runs until the next transition. Because transitions are stored
 * as calendar-day offsets plus a wall-clock time — never as elapsed hours —
 * a 6pm handover stays at 6pm across DST.
 */

import {
  addDays,
  dayOfWeek,
  localToInstant,
  parseLocalDate,
  type LocalDate,
} from "@/lib/time";

export type CustodyTemplateId =
  | "week-on-week-off"
  | "2-2-3"
  | "2-2-5-5"
  | "every-other-weekend"
  | "alternating-weekends";

/** Which of the two parents a segment belongs to. */
type Slot = "a" | "b";

interface Transition {
  /** Days after the cycle anchor. */
  dayOffset: number;
  hour: number;
  minute: number;
  slot: Slot;
}

interface TemplateDefinition {
  id: CustodyTemplateId;
  label: string;
  /** Plain-English summary. Shown in the picker so the pattern is never a mystery. */
  description: string;
  cycleDays: number;
  /**
   * Weekend-based patterns are meaningless relative to an arbitrary Monday, so
   * they anchor to the first Friday on or after the chosen start date. Even
   * splits just start when you say they start.
   */
  anchor: "start-date" | "first-friday";
  /**
   * Built from the handover hour the user picks. Weekend patterns pin their own
   * evening times, because "Friday teatime" is the actual convention and hiding
   * it behind a single global handover hour would misrepresent the schedule.
   */
  transitions: (handoverHour: number) => Transition[];
}

/**
 * Note on the last two: these are the same family of schedule, distinguished by
 * the midweek overnight. "Every other weekend" is the plain version;
 * "alternating weekends" adds a Wednesday night, which is the most common way
 * the pattern is actually run. If your arrangement differs, the transitions
 * below are the only thing to change — and you can always adjust individual
 * periods afterwards, since generated periods are ordinary editable rows.
 */
const TEMPLATES: Record<CustodyTemplateId, TemplateDefinition> = {
  "week-on-week-off": {
    id: "week-on-week-off",
    label: "Week on, week off",
    description:
      "A full week each, swapping on the same day every week. The simplest even split.",
    cycleDays: 14,
    anchor: "start-date",
    transitions: (h) => [
      { dayOffset: 0, hour: h, minute: 0, slot: "a" },
      { dayOffset: 7, hour: h, minute: 0, slot: "b" },
    ],
  },

  "2-2-3": {
    id: "2-2-3",
    label: "2-2-3",
    description:
      "Two days, two days, then a long weekend — alternating over a fortnight. Nobody goes more than three days without seeing the kids.",
    cycleDays: 14,
    anchor: "start-date",
    transitions: (h) => [
      { dayOffset: 0, hour: h, minute: 0, slot: "a" },
      { dayOffset: 2, hour: h, minute: 0, slot: "b" },
      { dayOffset: 4, hour: h, minute: 0, slot: "a" },
      { dayOffset: 7, hour: h, minute: 0, slot: "b" },
      { dayOffset: 9, hour: h, minute: 0, slot: "a" },
      { dayOffset: 11, hour: h, minute: 0, slot: "b" },
    ],
  },

  "2-2-5-5": {
    id: "2-2-5-5",
    label: "2-2-5-5",
    description:
      "Each parent keeps the same two weekdays every week, and the weekends alternate in five-day blocks.",
    cycleDays: 14,
    anchor: "start-date",
    transitions: (h) => [
      { dayOffset: 0, hour: h, minute: 0, slot: "a" },
      { dayOffset: 2, hour: h, minute: 0, slot: "b" },
      { dayOffset: 4, hour: h, minute: 0, slot: "a" },
      { dayOffset: 9, hour: h, minute: 0, slot: "b" },
    ],
  },

  "every-other-weekend": {
    id: "every-other-weekend",
    label: "Every other weekend",
    description:
      "One home during the week, with the other parent taking alternate weekends from Friday evening to Sunday evening.",
    cycleDays: 14,
    anchor: "first-friday",
    transitions: () => [
      { dayOffset: 0, hour: 18, minute: 0, slot: "b" },
      { dayOffset: 2, hour: 18, minute: 0, slot: "a" },
    ],
  },

  "alternating-weekends": {
    id: "alternating-weekends",
    label: "Alternating weekends + midweek",
    description:
      "Alternate weekends from Friday evening, plus a Wednesday overnight every week so the gap is never longer than a few days.",
    cycleDays: 14,
    anchor: "first-friday",
    transitions: () => [
      { dayOffset: 0, hour: 18, minute: 0, slot: "b" },
      { dayOffset: 2, hour: 18, minute: 0, slot: "a" },
      // Wednesday of the following week, back before school on Thursday.
      { dayOffset: 5, hour: 18, minute: 0, slot: "b" },
      { dayOffset: 6, hour: 8, minute: 0, slot: "a" },
      // ...and again the week the kids are not there for the weekend.
      { dayOffset: 12, hour: 18, minute: 0, slot: "b" },
      { dayOffset: 13, hour: 8, minute: 0, slot: "a" },
    ],
  },
};

export const CUSTODY_TEMPLATES: TemplateDefinition[] = Object.values(TEMPLATES);

export function getCustodyTemplate(id: CustodyTemplateId): TemplateDefinition {
  const template = TEMPLATES[id];
  if (!template) throw new Error(`Unknown custody template "${id}"`);
  return template;
}

export interface GenerateCustodyOptions {
  template: CustodyTemplateId;
  /** "YYYY-MM-DD" in the family's timezone. */
  startDate: string;
  /** How far ahead to generate. */
  weeks: number;
  /** The parent the pattern starts with, and — for weekend patterns — the one with the weekday home. */
  parentAId: string;
  parentBId: string;
  timeZone: string;
  /** Wall-clock hour for handovers in the even-split patterns. */
  handoverHour?: number;
}

export interface GeneratedCustodyPeriod {
  parentProfileId: string;
  startsAt: Date;
  endsAt: Date;
}

const MAX_WEEKS = 260; // five years; a guard against absurd input, not a policy

/**
 * Expands a template into concrete custody periods.
 *
 * The result is contiguous and strictly non-overlapping — which it has to be,
 * because the database enforces the same thing with an exclusion constraint.
 * Adjacent periods share a boundary instant, and ranges are half-open, so
 * touching periods do not collide.
 */
export function generateCustodyPeriods(
  options: GenerateCustodyOptions,
): GeneratedCustodyPeriod[] {
  const {
    template: templateId,
    startDate,
    weeks,
    parentAId,
    parentBId,
    timeZone,
    handoverHour = 9,
  } = options;

  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
    throw new Error(`weeks must be a whole number between 1 and ${MAX_WEEKS}`);
  }
  if (handoverHour < 0 || handoverHour > 23) {
    throw new Error("handoverHour must be between 0 and 23");
  }
  if (parentAId === parentBId) {
    throw new Error("The two parents must be different people");
  }

  const template = getCustodyTemplate(templateId);
  const start = parseLocalDate(startDate);
  const horizonEnd = localToInstant(
    { ...addDays(start, weeks * 7), hour: 0, minute: 0 },
    timeZone,
  );

  const anchor = resolveAnchor(start, template.anchor);
  const transitions = template.transitions(handoverHour);
  const idFor = (slot: Slot) => (slot === "a" ? parentAId : parentBId);

  // Every boundary in the horizon, in order, each carrying the parent who takes
  // over at that moment.
  const boundaries: { at: Date; slot: Slot }[] = [];

  // Weekend patterns anchor forward to the first Friday, so the days between the
  // chosen start and that Friday would otherwise be a hole. The weekday parent
  // covers them.
  const scheduleStart = localToInstant(
    { ...start, hour: 0, minute: 0 },
    timeZone,
  );
  boundaries.push({ at: scheduleStart, slot: "a" });

  // Generous cycle count: trimming happens below, and over-generating costs
  // nothing while under-generating would leave a gap at the horizon.
  const cycles = Math.ceil((weeks * 7) / template.cycleDays) + 1;

  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const transition of transitions) {
      const date = addDays(
        anchor,
        cycle * template.cycleDays + transition.dayOffset,
      );
      const at = localToInstant(
        { ...date, hour: transition.hour, minute: transition.minute },
        timeZone,
      );
      if (at.getTime() <= scheduleStart.getTime()) continue;
      if (at.getTime() >= horizonEnd.getTime()) continue;
      boundaries.push({ at, slot: transition.slot });
    }
  }

  boundaries.sort((a, b) => a.at.getTime() - b.at.getTime());

  const periods: GeneratedCustodyPeriod[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const endsAt = to ? to.at : horizonEnd;
    if (endsAt.getTime() <= from.at.getTime()) continue;

    const parentProfileId = idFor(from.slot);
    const previous = periods[periods.length - 1];

    // Merge runs of the same parent. This happens legitimately: in the
    // every-other-weekend pattern the weekday parent holds from Sunday evening
    // straight through to the Friday of the following week, across a cycle
    // boundary. Emitting that as one period keeps the calendar honest and
    // avoids a pointless "handover to yourself".
    if (previous && previous.parentProfileId === parentProfileId) {
      previous.endsAt = endsAt;
      continue;
    }

    periods.push({ parentProfileId, startsAt: from.at, endsAt });
  }

  return periods;
}

function resolveAnchor(
  start: LocalDate,
  anchor: TemplateDefinition["anchor"],
): LocalDate {
  if (anchor === "start-date") return start;

  // First Friday on or after the start date. 5 === Friday.
  const daysUntilFriday = (5 - dayOfWeek(start) + 7) % 7;
  return addDays(start, daysUntilFriday);
}
