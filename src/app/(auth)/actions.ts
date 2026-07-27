"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.string().trim().email("That does not look like an email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters — a short phrase works well."),
});

const signUpSchema = credentials.extend({
  displayName: z
    .string()
    .trim()
    .min(1, "What should we call you?")
    .max(80, "That name is a little too long."),
});

/** Where to send someone after signing in, kept to same-origin paths. */
function safeNext(value: FormData["get"] extends never ? never : unknown) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/calendar";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague: saying which half was wrong tells an attacker
    // whether an address has an account here.
    return { error: "That email and password did not match." };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user trigger to seed the profile.
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: siteUrl() ? `${siteUrl()}/auth/callback` : undefined,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // With email confirmation switched on there is no session yet.
  if (!data.session) {
    return {
      notice:
        "Check your email for a confirmation link, then come back and sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/welcome");
}

/** Passwordless alternative; useful when you are signing in on a new phone. */
export async function sendMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = z
    .string()
    .trim()
    .email()
    .safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: "Enter your email address first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: siteUrl() ? `${siteUrl()}/auth/callback` : undefined,
    },
  });

  if (error) return { error: error.message };

  return { notice: `Sent a sign-in link to ${parsed.data}.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
