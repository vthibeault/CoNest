import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "@/components/invite/accept-invite-button";

export const metadata: Metadata = { title: "Join a family · CoNest" };

/**
 * Landing page for an invite link.
 *
 * The code is not looked up here: an invite is only readable by people already
 * in the family, and the invitee by definition is not one yet. accept_invite()
 * validates it server-side. So this page cannot preview the family name — which
 * is also the right privacy outcome, since anyone with a URL could otherwise
 * fish for it.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Sign in first, then come straight back here.
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <Wordmark className="mb-8 justify-center" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Join your co-parent
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Accepting will share this family&rsquo;s calendar with you, and yours
          with them.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <AcceptInviteButton code={code} />
          <Button asChild variant="ghost">
            <Link href="/calendar">Not now</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
