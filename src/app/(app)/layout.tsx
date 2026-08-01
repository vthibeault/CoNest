import Link from "next/link";
import { Settings } from "lucide-react";

import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

/*
  App shell.

  There is deliberately no bottom navigation yet: with a single section it
  would be chrome for its own sake. When Expenses lands, add the nav here and
  in the header — the layout is already the right place for it.
*/
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/calendar" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Wordmark className="text-lg" />
          </Link>
          <Button asChild variant="ghost" size="icon">
            <Link href="/settings">
              <Settings />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
