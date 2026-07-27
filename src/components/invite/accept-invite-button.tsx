"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { acceptInvite, type InviteState } from "@/app/invite-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Joining…" : "Accept invite"}
    </Button>
  );
}

export function AcceptInviteButton({ code }: { code: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    acceptInvite,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      <Submit />
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
