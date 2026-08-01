"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getFamilyContext } from "@/lib/family";

export interface InviteState {
  error?: string;
  code?: string;
}

/** Generates a code the co-parent can redeem. Server-side, so codes stay random. */
export async function createInvite(): Promise<InviteState> {
  const context = await getFamilyContext();
  if (!context) return { error: "Set up your family first." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", {
    p_family_id: context.family.id,
    p_invited_email: null,
  });

  if (error || !data) {
    return { error: error?.message ?? "Could not create an invite." };
  }

  revalidatePath("/settings");
  return { code: data.code };
}

export async function acceptInvite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = z
    .string()
    .trim()
    .min(1, "Enter the code your co-parent sent you.")
    .safeParse(formData.get("code"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", {
    p_code: parsed.data,
  });

  if (error) {
    // These messages come from accept_invite()'s own RAISEs and are written to
    // be read by a person, so they pass through as-is.
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/calendar");
}
