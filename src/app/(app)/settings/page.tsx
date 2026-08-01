import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvitePanel } from "@/components/invite/invite-panel";
import { parentColors } from "@/lib/calendar/colors";
import { coParentOf, getFamilyContext } from "@/lib/family";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings · CoNest" };

export default async function SettingsPage() {
  const context = await getFamilyContext();
  if (!context) redirect("/welcome");

  const coParent = coParentOf(context);

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
          Settings
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{context.family.name}</CardTitle>
          <CardDescription>
            {context.family.timezone} · {context.family.currency}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Parents</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {context.parents.map((parent) => (
                <li key={parent.profileId} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      parentColors(parent.colorSlot).solid,
                    )}
                  />
                  {parent.isSelf ? `${parent.displayName} (you)` : parent.displayName}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium">Children</p>
            {context.children.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                {context.children.map((child) => (
                  <li key={child.id}>{child.name}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                None added yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {coParent ? (
        <Card>
          <CardHeader>
            <CardTitle>Your co-parent</CardTitle>
            <CardDescription>
              {coParent.displayName} has joined and shares this calendar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <InvitePanel />
      )}

      {/*
        Extension point: Expenses, Decisions and the Kids' Info Library get
        their own cards here as they land. The schema and RLS for all three
        already exist.
      */}

      <form action={signOut}>
        <Button type="submit" variant="ghost" className="text-muted-foreground">
          Sign out
        </Button>
      </form>
    </div>
  );
}
