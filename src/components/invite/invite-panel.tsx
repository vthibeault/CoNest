"use client";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createInvite } from "@/app/invite-actions";

/**
 * Invite plumbing.
 *
 * Framed as an optional extra rather than a setup step, because everything in
 * CoNest already works without it — that is the whole premise. The copy is a
 * gentle "come and see", never a nag.
 */
export function InvitePanel() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const link =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/join/${code}`
      : null;

  async function generate() {
    setPending(true);
    setError(null);
    const result = await createInvite();
    setPending(false);
    if (result.error) setError(result.error);
    else if (result.code) setCode(result.code);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the link is on screen to copy by hand.
      setError("Could not copy automatically — the link is above.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite your co-parent</CardTitle>
        <CardDescription>
          Optional. Everything here already works on your own — inviting them
          just means you both see the same schedule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {link ? (
          <>
            <p className="break-all rounded-lg bg-secondary px-3 py-2 font-mono text-sm">
              {link}
            </p>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Send it however you already talk. It works once and expires in two
              weeks.
            </p>
          </>
        ) : (
          <Button onClick={generate} disabled={pending} variant="outline">
            <UserPlus />
            {pending ? "Creating…" : "Create an invite link"}
          </Button>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
