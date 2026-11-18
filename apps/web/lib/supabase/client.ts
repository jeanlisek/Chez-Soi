"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";

/** Client Supabase du navigateur (clé publique, RLS). Null si le projet n'est pas configuré. */
export function clientNavigateur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;
  return createBrowserClient<Database>(url, cle);
}
