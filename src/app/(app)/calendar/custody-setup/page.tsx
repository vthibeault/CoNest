import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustodySetupForm } from "@/components/calendar/custody-setup-form";
import { getFamilyContext } from "@/lib/family";
import { localDateOf } from "@/lib/time";
import { formatLocalDate } from "@/lib/time";

export const metadata: Metadata = { title: "Custody pattern · CoNest" };

export default async function CustodySetupPage() {
  const context = await getFamilyContext();
  if (!context) redirect("/welcome");

  const today = localDateOf(new Date(), context.family.timezone);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/calendar">
            <ChevronLeft />
            Calendar
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Set up a custody pattern
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Pick the shape of your arrangement and CoNest fills in the calendar.
          Everything it creates is editable afterwards, so this is a starting
          point rather than a commitment.
        </p>
      </div>

      <CustodySetupForm
        parents={context.parents}
        defaultStartDate={formatLocalDate(today)}
      />
    </div>
  );
}
