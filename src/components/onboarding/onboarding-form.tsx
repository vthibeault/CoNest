"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/app/(onboarding)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Setting things up…" : "Create my family"}
    </Button>
  );
}

export function OnboardingForm({ className }: { className?: string }) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );

  // Two blank rows to begin with: enough to feel natural, and empty ones are
  // dropped server-side rather than nagged about.
  const [childCount, setChildCount] = useState(2);

  /*
    The family's timezone anchors every all-day event and custody boundary, so
    detecting it beats asking on day one. Written straight to the input rather
    than held in state: the server renders "UTC", and reading Intl during
    render would produce a hydration mismatch on any machine that is not.
  */
  const timeZoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timeZoneRef.current) timeZoneRef.current.value = browserTimeZone();
  }, []);

  return (
    <form action={formAction} className={cn("flex flex-col gap-6", className)}>
      <input
        ref={timeZoneRef}
        type="hidden"
        name="timeZone"
        defaultValue="UTC"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="familyName">Family name</Label>
        <Input
          id="familyName"
          name="familyName"
          required
          maxLength={120}
          placeholder="The Bennetts"
        />
        <p className="text-xs text-muted-foreground">
          Just for your own reference — nobody else sees it unless you invite
          them.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Your children</legend>

        {Array.from({ length: childCount }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              name="childName"
              maxLength={80}
              aria-label={`Child ${index + 1} name`}
              placeholder={index === 0 ? "Ellie" : "Add another"}
            />
            {childCount > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => setChildCount((count) => count - 1)}
              >
                <X />
                <span className="sr-only">Remove this row</span>
              </Button>
            ) : null}
          </div>
        ))}

        {childCount < 12 ? (
          <Button
            type="button"
            variant="ghost"
            className="self-start text-primary"
            onClick={() => setChildCount((count) => count + 1)}
          >
            <Plus />
            Add another child
          </Button>
        ) : null}

        <p className="text-xs text-muted-foreground">
          You can leave these blank and add them later.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currency">Currency</Label>
        <Input
          id="currency"
          name="currency"
          required
          defaultValue="USD"
          maxLength={3}
          className="w-28 uppercase"
          pattern="[A-Za-z]{3}"
        />
        <p className="text-xs text-muted-foreground">
          Used when you start tracking shared costs.
        </p>
      </div>

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
