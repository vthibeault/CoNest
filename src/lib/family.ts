import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Child, Family, ParentSummary } from "@/lib/types";

export interface FamilyContext {
  family: Family;
  /** Everyone in the family, with the signed-in parent first. */
  parents: ParentSummary[];
  children: Child[];
  self: ParentSummary;
}

/**
 * Loads everything the app needs to render a family, or null when the signed-in
 * user has not set one up yet (which sends them to onboarding).
 *
 * Wrapped in React's `cache` so a page and its nested components share one
 * round trip per request rather than each refetching.
 *
 * Solo-first by construction: a family with a single parent is the normal case,
 * not a degraded one. Nothing here requires a second member to exist.
 */
export const getFamilyContext = cache(
  async (): Promise<FamilyContext | null> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // RLS limits this to families the caller belongs to, so no filtering by
    // user id is needed — or possible to get wrong.
    const { data: families, error } = await supabase
      .from("families")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw error;
    const family = families?.[0];
    if (!family) return null;

    const [membersResult, childrenResult] = await Promise.all([
      supabase
        .from("family_members")
        .select("profile_id, color_slot, profiles(display_name)")
        .eq("family_id", family.id)
        .order("color_slot", { ascending: true }),
      supabase
        .from("children")
        .select("*")
        .eq("family_id", family.id)
        .order("birthdate", { ascending: true, nullsFirst: false }),
    ]);

    if (membersResult.error) throw membersResult.error;
    if (childrenResult.error) throw childrenResult.error;

    type MemberRow = {
      profile_id: string;
      color_slot: ParentSummary["colorSlot"];
      profiles: { display_name: string } | { display_name: string }[] | null;
    };

    const parents: ParentSummary[] = (
      (membersResult.data ?? []) as unknown as MemberRow[]
    ).map((row) => {
      // PostgREST returns an embedded row as an object or a single-element
      // array depending on how it infers the relationship; normalise both.
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        profileId: row.profile_id,
        displayName: profile?.display_name ?? "Parent",
        colorSlot: row.color_slot,
        isSelf: row.profile_id === user.id,
      };
    });

    const self = parents.find((p) => p.isSelf);
    if (!self) return null;

    // Put the signed-in parent first: "you" should always read first in the
    // legend and in every "who has them" summary.
    parents.sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

    return {
      family,
      parents,
      children: childrenResult.data ?? [],
      self,
    };
  },
);

/** The co-parent, if one has joined. Null while the app is still solo. */
export function coParentOf(context: FamilyContext): ParentSummary | null {
  return context.parents.find((p) => !p.isSelf) ?? null;
}
