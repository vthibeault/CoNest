import type { ColorSlot } from "@/lib/types";

/**
 * Parent colours, keyed by the slot stored on family_members.
 *
 * Written out as complete class strings because Tailwind scans source
 * statically — a template literal like `bg-parent-${slot}` compiles to nothing.
 *
 * Slots c and d exist because the schema does not hard-code a two-parent
 * family, but the product is built for two; they fall back to neutral tones.
 */
export const PARENT_COLORS: Record<
  ColorSlot,
  { solid: string; soft: string; text: string; border: string; ring: string }
> = {
  a: {
    solid: "bg-parent-a",
    soft: "bg-parent-a-soft",
    text: "text-parent-a",
    border: "border-parent-a",
    ring: "ring-parent-a",
  },
  b: {
    solid: "bg-parent-b",
    soft: "bg-parent-b-soft",
    text: "text-parent-b",
    border: "border-parent-b",
    ring: "ring-parent-b",
  },
  c: {
    solid: "bg-primary",
    soft: "bg-primary/10",
    text: "text-primary",
    border: "border-primary",
    ring: "ring-primary",
  },
  d: {
    solid: "bg-muted-foreground",
    soft: "bg-muted",
    text: "text-muted-foreground",
    border: "border-muted-foreground",
    ring: "ring-muted-foreground",
  },
};

export function parentColors(slot: ColorSlot) {
  return PARENT_COLORS[slot] ?? PARENT_COLORS.d;
}
