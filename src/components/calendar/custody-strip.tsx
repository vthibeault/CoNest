import { parentColors } from "@/lib/calendar/colors";
import type { CustodySegment } from "@/lib/calendar/model";
import type { ParentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A day's custody rendered as a proportional bar.
 *
 * On a handover day the bar is split at the moment of the handover, so the
 * shape of the day is legible before you read a single word.
 */
export function CustodyStrip({
  segments,
  parents,
  className,
  rounded = true,
}: {
  segments: CustodySegment[];
  parents: ParentSummary[];
  className?: string;
  rounded?: boolean;
}) {
  if (segments.length === 0) {
    return (
      <div
        className={cn("bg-muted", rounded && "rounded-full", className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex overflow-hidden",
        rounded && "rounded-full",
        className,
      )}
      aria-hidden="true"
    >
      {segments.map((segment, index) => {
        const parent = parents.find(
          (p) => p.profileId === segment.parentProfileId,
        );
        const colors = parentColors(parent?.colorSlot ?? "d");
        return (
          <span
            key={index}
            className={colors.solid}
            style={{ width: `${Math.max(0, (segment.to - segment.from) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

/** Screen-reader text for a day's custody, since the bar itself is decorative. */
export function describeCustody(
  segments: CustodySegment[],
  parents: ParentSummary[],
): string {
  if (segments.length === 0) return "No custody set";

  const names = segments.map((segment) => {
    const parent = parents.find((p) => p.profileId === segment.parentProfileId);
    if (!parent) return "unknown";
    return parent.isSelf ? "you" : parent.displayName;
  });

  const unique = Array.from(new Set(names));
  if (unique.length === 1) return `With ${unique[0]}`;
  return `With ${unique.slice(0, -1).join(", ")}, then ${unique[unique.length - 1]}`;
}
