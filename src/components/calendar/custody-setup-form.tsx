"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parentColors } from "@/lib/calendar/colors";
import {
  CUSTODY_TEMPLATES,
  generateCustodyPeriods,
  type CustodyTemplateId,
} from "@/lib/custody/templates";
import { formatTime, weekdayName } from "@/lib/calendar/model";
import { localDateOf } from "@/lib/time";
import type { ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  generateSchedule,
  type ActionState,
} from "@/app/(app)/calendar/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Building the schedule…" : "Create this schedule"}
    </Button>
  );
}

export function CustodySetupForm({
  parents,
  defaultStartDate,
}: {
  parents: ParentSummary[];
  defaultStartDate: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(
    generateSchedule,
    {},
  );

  const self = parents.find((p) => p.isSelf) ?? parents[0];
  const other = parents.find((p) => !p.isSelf) ?? null;

  const [template, setTemplate] = useState<CustodyTemplateId>("week-on-week-off");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [handoverHour, setHandoverHour] = useState(9);
  const [startingParentId, setStartingParentId] = useState(self.profileId);

  useEffect(() => {
    if (state.ok) router.push("/calendar");
  }, [state.ok, router]);

  const startingParent =
    parents.find((p) => p.profileId === startingParentId) ?? self;
  const otherParent =
    parents.find((p) => p.profileId !== startingParentId) ?? other;

  /*
    Live preview built with the very same pure function the server uses, so
    what you see here is exactly what gets written. Worth the duplication:
    a custody pattern is hard to picture in the abstract and easy to get
    subtly wrong, and finding that out after it has filled your calendar is
    a bad time.
  */
  const preview = useMemo(() => {
    if (!otherParent) return null;
    try {
      return generateCustodyPeriods({
        template,
        startDate,
        weeks: 3,
        parentAId: startingParent.profileId,
        parentBId: otherParent.profileId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        handoverHour,
      }).slice(0, 7);
    } catch {
      return null;
    }
  }, [template, startDate, handoverHour, startingParent, otherParent]);

  const definition = CUSTODY_TEMPLATES.find((t) => t.id === template);

  if (!otherParent) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6">
        <p className="font-medium">You&rsquo;ll need your co-parent first</p>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          A custody pattern splits time between two people, so it needs both of
          you. Invite your co-parent from settings, then come back — everything
          else in CoNest works on your own in the meantime.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <a href="/settings">Invite your co-parent</a>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-7">
      <input type="hidden" name="template" value={template} />
      <input type="hidden" name="startingParentId" value={startingParent.profileId} />
      <input type="hidden" name="otherParentId" value={otherParent.profileId} />
      <input type="hidden" name="handoverHour" value={handoverHour} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">The pattern</legend>
        {CUSTODY_TEMPLATES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTemplate(option.id)}
            aria-pressed={template === option.id}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              template === option.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            <p className="font-medium">{option.label}</p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              {option.description}
            </p>
          </button>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          {definition?.anchor === "first-friday"
            ? "Who has them during the week?"
            : "Who starts?"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {parents.map((parent) => (
            <button
              key={parent.profileId}
              type="button"
              onClick={() => setStartingParentId(parent.profileId)}
              aria-pressed={startingParentId === parent.profileId}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition-colors",
                startingParentId === parent.profileId
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  parentColors(parent.colorSlot).solid,
                )}
              />
              {parent.isSelf ? "You" : parent.displayName}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">Starting from</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weeks">How far ahead</Label>
          <select
            id="weeks"
            name="weeks"
            defaultValue="26"
            className="h-11 rounded-lg border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="12">3 months</option>
            <option value="26">6 months</option>
            <option value="52">A year</option>
          </select>
        </div>
      </div>

      {definition?.anchor === "start-date" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handoverHour">Handovers happen at</Label>
          <select
            id="handoverHour"
            value={handoverHour}
            onChange={(e) => setHandoverHour(Number(e.target.value))}
            className="h-11 w-40 rounded-lg border border-input bg-card px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {hour === 0
                  ? "12am"
                  : hour < 12
                    ? `${hour}am`
                    : hour === 12
                      ? "12pm"
                      : `${hour - 12}pm`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">The first few weeks</p>
          <ol className="mt-3 flex flex-col gap-2">
            {preview.map((period, index) => {
              const parent = parents.find(
                (p) => p.profileId === period.parentProfileId,
              );
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
              const from = localDateOf(period.startsAt, tz);
              return (
                <li key={index} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      parentColors(parent?.colorSlot ?? "d").solid,
                    )}
                  />
                  <span className="font-medium">
                    {parent?.isSelf ? "You" : parent?.displayName}
                  </span>
                  <span className="text-muted-foreground">
                    from {weekdayName(from, true)} {from.day}
                    {period.startsAt.getTime() % 86_400_000 === 0
                      ? ""
                      : ` ${formatTime(period.startsAt, tz)}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
        <Checkbox name="replaceExisting" className="mt-0.5" />
        <span className="text-sm">
          <span className="font-medium">Replace what&rsquo;s already there</span>
          <span className="mt-0.5 block text-muted-foreground">
            Clears any existing custody covering these dates first — including
            days you&rsquo;ve adjusted by hand. Leave this off and CoNest will
            stop rather than overwrite anything.
          </span>
        </span>
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
