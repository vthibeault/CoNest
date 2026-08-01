import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Lands email confirmations and magic links: exchanges the one-time code for a
 * session, then sends the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Only same-origin paths, so a crafted link cannot bounce someone off-site
  // carrying a fresh session.
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/calendar";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That sign-in link is no longer valid.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That sign-in link has expired. Try again.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
