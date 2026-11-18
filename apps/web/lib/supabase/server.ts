import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export function supabaseConfigure(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Client Supabase serveur au nom de l'utilisateur connecté (cookies de session, RLS). */
export async function clientServeur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;
  const jar = await cookies();
  return createServerClient<Database>(url, cle, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (aPoser) => {
        try {
          for (const { name, value, options } of aPoser) jar.set(name, value, options);
        } catch {
          /* appelé depuis un composant serveur : le middleware rafraîchit la session */
        }
      },
    },
  });
}

/**
 * Client « service_role » : contourne la RLS. Réservé aux écritures que la RLS réserve au serveur
 * (`analyses`, `runs_agent`, `validations`…), toujours après avoir vérifié l'utilisateur et
 * la propriété du logement. La clé ne quitte jamais le serveur.
 */
export function clientAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return createClient<Database>(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}
