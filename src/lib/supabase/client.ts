import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Supabase client for use in client components. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
