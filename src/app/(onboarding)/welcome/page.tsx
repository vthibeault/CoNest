import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getFamilyContext } from "@/lib/family";

export const metadata: Metadata = { title: "Welcome · CoNest" };

export default async function WelcomePage() {
  // Already set up — no reason to see this again.
  if (await getFamilyContext()) redirect("/calendar");

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Wordmark className="mb-8" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Let&rsquo;s set up your family
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          This takes about a minute, and everything works straight away — you
          can invite your co-parent whenever you&rsquo;re ready.
        </p>

        <OnboardingForm className="mt-8" />
      </div>
    </main>
  );
}
