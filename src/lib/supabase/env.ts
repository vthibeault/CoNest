/**
 * Reads Supabase configuration from the environment.
 *
 * Throws loudly and specifically when a variable is missing. The default
 * failure mode otherwise is an opaque "fetch failed" from deep inside the
 * client, which is a miserable thing to debug on a fresh deploy.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your Supabase project details.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Origin used to build invite and email-confirmation links. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}
