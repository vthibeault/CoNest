"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/app/(auth)/actions";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "One moment…" : children}
    </Button>
  );
}

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  magicLinkAction?: (
    state: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  next?: string;
  initialError?: string;
}

export function AuthForm({
  mode,
  action,
  magicLinkAction,
  next,
  initialError,
}: AuthFormProps) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(action, {
    error: initialError,
  });
  const isSignUp = mode === "sign-up";

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <form action={formAction} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {isSignUp ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              name="displayName"
              autoComplete="name"
              required
              placeholder="Alex"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={8}
          />
          {isSignUp ? (
            <p className="text-xs text-muted-foreground">
              At least 8 characters. A short phrase is easier to remember than a
              jumble.
            </p>
          ) : null}
        </div>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        {state.notice ? (
          <p
            role="status"
            className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            {state.notice}
          </p>
        ) : null}

        <SubmitButton>{isSignUp ? "Create account" : "Sign in"}</SubmitButton>
      </form>

      {magicLinkAction ? <MagicLink action={magicLinkAction} /> : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function MagicLink({
  action,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-5 border-t border-border pt-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="magic-email" className="text-muted-foreground">
          Or get a sign-in link by email
        </Label>
        <div className="flex gap-2">
          <Input
            id="magic-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Button type="submit" variant="outline" className="shrink-0">
            Send
          </Button>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="mt-2 text-sm text-primary">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
