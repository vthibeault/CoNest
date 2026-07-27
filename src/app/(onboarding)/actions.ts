"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
}

const schema = z.object({
  familyName: z
    .string()
    .trim()
    .min(1, "Give your family a name — your surname is fine.")
    .max(120),
  timeZone: z.string().trim().min(1).max(64),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a three-letter currency code, like USD.")
    .transform((value) => value.toUpperCase()),
  // Empty rows are filtered rather than rejected: the form ships with a couple
  // of blank inputs and expecting people to tidy them up is needless friction.
  childNames: z.array(z.string().trim()).transform((names) =>
    names.filter((name) => name.length > 0).slice(0, 12),
  ),
});

/**
 * Creates the family and its children in one go.
 *
 * Solo-first: nothing here asks about a second parent. They are invited later,
 * from settings, whenever it suits.
 */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    familyName: formData.get("familyName"),
    timeZone: formData.get("timeZone"),
    currency: formData.get("currency"),
    childNames: formData.getAll("childName").map(String),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data: familyId, error } = await supabase.rpc("create_family", {
    p_name: parsed.data.familyName,
    p_timezone: parsed.data.timeZone,
    p_currency: parsed.data.currency,
  });

  if (error || !familyId) {
    return { error: error?.message ?? "Could not create your family." };
  }

  if (parsed.data.childNames.length > 0) {
    const { error: childError } = await supabase.from("children").insert(
      parsed.data.childNames.map((name) => ({
        family_id: familyId,
        name,
      })),
    );

    // The family exists and is usable, so send them in rather than stranding
    // them on a form. Children can be added from settings.
    if (childError) {
      revalidatePath("/", "layout");
      redirect("/calendar?notice=children-failed");
    }
  }

  revalidatePath("/", "layout");
  redirect("/calendar");
}
