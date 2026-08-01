import { cn } from "@/lib/utils";

/**
 * The CoNest mark: an egg cradled in an open nest. Drawn inline rather than
 * loaded as an image so it inherits colour and never flashes in late.
 */
export function NestMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
    >
      <circle cx="24" cy="19" r="8" fill="currentColor" />
      <path
        d="M7 24a17 17 0 0 0 34 0"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight",
        className,
      )}
    >
      <NestMark className="size-7 text-primary" />
      CoNest
    </span>
  );
}
