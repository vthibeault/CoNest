"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getFamilyContext } from "@/lib/family";
import { eventInstants } from "@/lib/calendar/event-times";
import {
  generateCustodyPeriods,
  type CustodyTemplateId,
} from "@/lib/custody/templates";

export interface ActionState {
  error?: string;
  ok?: boolean;
}

const EVENT_TYPES = [
  "handover",
  "appointment",
  "activity",
  "school",
  "other",
] as const;

const eventSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(EVENT_TYPES),
    title: z.string().trim().min(1, "Give the event a name.").max(200),
    date: z.string(),
    allDay: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    location: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    childIds: z.array(z.string().uuid()),
  })
  .refine((value) => value.allDay || value.startTime, {
    message: "Choose a start time, or mark it as all day.",
    path: ["startTime"],
  });

function parseForm(formData: FormData) {
  return eventSchema.safeParse({
    id: formData.get("id") || undefined,
    type: formData.get("type"),
    title: formData.get("title"),
    date: formData.get("date"),
    allDay: formData.get("allDay") === "on",
    startTime: formData.get("startTime") || undefined,
    endTime: formData.get("endTime") || undefined,
    location: formData.get("location") || undefined,
    notes: formData.get("notes") || undefined,
    childIds: formData.getAll("childId").map(String),
  });
}

export async function saveEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getFamilyContext();
  if (!context) return { error: "Set up your family first." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { family } = context;
  const timeZone = family.timezone;

  let startsAt: Date;
  let endsAt: Date;
  try {
    ({ startsAt, endsAt } = eventInstants({
      date: parsed.data.date,
      allDay: parsed.data.allDay,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      timeZone,
    }));
  } catch {
    return { error: "That date or time is not valid." };
  }

  if (endsAt.getTime() < startsAt.getTime()) {
    return { error: "The end time is before the start time." };
  }

  const supabase = await createClient();

  const row = {
    family_id: family.id,
    type: parsed.data.type,
    title: parsed.data.title,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: parsed.data.allDay,
    location: parsed.data.location ?? null,
    notes: parsed.data.notes ?? null,
  };

  let eventId = parsed.data.id;

  if (eventId) {
    const { error } = await supabase
      .from("events")
      .update(row)
      .eq("id", eventId);
    if (error) return { error: error.message };

    // Replace the child links wholesale — simpler and less error-prone than
    // diffing, and the sets are tiny.
    const { error: unlinkError } = await supabase
      .from("event_children")
      .delete()
      .eq("event_id", eventId);
    if (unlinkError) return { error: unlinkError.message };
  } else {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...row, created_by: context.self.profileId })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not save." };
    eventId = data.id;
  }

  if (parsed.data.childIds.length > 0) {
    const { error } = await supabase.from("event_children").insert(
      parsed.data.childIds.map((childId) => ({
        event_id: eventId!,
        child_id: childId,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteEvent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Could not find that event." };

  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id.data);
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * Custody schedule generation
 * ------------------------------------------------------------------------ */

const custodySchema = z.object({
  template: z.string(),
  startDate: z.string(),
  weeks: z.coerce.number().int().min(1).max(104),
  startingParentId: z.string().uuid(),
  otherParentId: z.string().uuid(),
  handoverHour: z.coerce.number().int().min(0).max(23),
  replaceExisting: z.boolean(),
});

export async function generateSchedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getFamilyContext();
  if (!context) return { error: "Set up your family first." };

  const parsed = custodySchema.safeParse({
    template: formData.get("template"),
    startDate: formData.get("startDate"),
    weeks: formData.get("weeks"),
    startingParentId: formData.get("startingParentId"),
    otherParentId: formData.get("otherParentId"),
    handoverHour: formData.get("handoverHour"),
    replaceExisting: formData.get("replaceExisting") === "on",
  });

  if (!parsed.success) {
    return { error: "Check the options and try again." };
  }

  const memberIds = new Set(context.parents.map((p) => p.profileId));
  if (
    !memberIds.has(parsed.data.startingParentId) ||
    !memberIds.has(parsed.data.otherParentId)
  ) {
    return { error: "Those parents are not both in this family." };
  }

  let periods;
  try {
    periods = generateCustodyPeriods({
      template: parsed.data.template as CustodyTemplateId,
      startDate: parsed.data.startDate,
      weeks: parsed.data.weeks,
      parentAId: parsed.data.startingParentId,
      parentBId: parsed.data.otherParentId,
      timeZone: context.family.timezone,
      handoverHour: parsed.data.handoverHour,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not build that schedule.",
    };
  }

  if (periods.length === 0) return { error: "That produced no dates." };

  const supabase = await createClient();
  const windowStart = periods[0].startsAt.toISOString();
  const windowEnd = periods[periods.length - 1].endsAt.toISOString();

  /*
    The database forbids overlapping custody, so anything already sitting in
    this window has to go first or the insert fails wholesale. That is the
    constraint doing its job — it is the reason the calendar can always answer
    "who has them" with one name — but it does mean regenerating over a period
    you have hand-edited will discard those edits, which the form warns about.
  */
  if (parsed.data.replaceExisting) {
    const { error } = await supabase
      .from("custody_periods")
      .delete()
      .lt("starts_at", windowEnd)
      .gt("ends_at", windowStart);
    if (error) return { error: error.message };
  }

  const batch = crypto.randomUUID();
  const { error } = await supabase.from("custody_periods").insert(
    periods.map((period) => ({
      family_id: context.family.id,
      parent_profile_id: period.parentProfileId,
      starts_at: period.startsAt.toISOString(),
      ends_at: period.endsAt.toISOString(),
      source: "template" as const,
      template_batch: batch,
    })),
  );

  if (error) {
    // 23P01 is exclusion_violation: something already occupies this window.
    if (error.code === "23P01") {
      return {
        error:
          "There is already a custody schedule covering some of those dates. Tick “replace what's there” to overwrite it.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/calendar");
  return { ok: true };
}
