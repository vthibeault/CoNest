"use client";

import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parentColors } from "@/lib/calendar/colors";
import { custodyNow, describeMoment } from "@/lib/calendar/model";
import type { CustodyPeriod, ParentSummary } from "@/lib/types";

/**
 * The emotional core of the app: open it and instantly know who has the kids.
 *
 * Phrased in the second person because that is how the question is actually
 * asked in your head — "have I got them this weekend?" — and stated as a
 * sentence rather than a colour-coded row, because a sentence needs no legend.
 */
export function CustodyBanner({
  custody,
  parents,
  timeZone,
  now,
}: {
  custody: CustodyPeriod[];
  parents: ParentSummary[];
  timeZone: string;
  now: Date;
}) {
  const current = custodyNow(custody, parents, now);

  if (!current) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5">
        <p className="font-display text-lg font-semibold tracking-tight">
          No custody schedule yet
        </p>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          Set up a pattern once and the calendar fills itself in. You can adjust
          any of it afterwards.
        </p>
        <Button asChild className="mt-4">
          <Link href="/calendar/custody-setup">
            <CalendarRange />
            Set up the schedule
          </Link>
        </Button>
      </div>
    );
  }

  const colors = parentColors(current.parent.colorSlot);
  const who = current.parent.isSelf ? "with you" : `with ${current.parent.displayName}`;

  return (
    <div className={`rounded-2xl border border-border ${colors.soft} p-5`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 size-3 shrink-0 rounded-full ${colors.solid}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold leading-snug tracking-tight">
            The kids are {who}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            until {describeMoment(current.until, timeZone)}
            {current.next
              ? current.next.isSelf
                ? ", then they come to you"
                : `, then over to ${current.next.displayName}`
              : null}
          </p>
        </div>
      </div>
    </div>
  );
}
