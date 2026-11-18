import "server-only";

import { NextResponse } from "next/server";

import { clientServeur } from "@/lib/supabase/server";

/**
 * Vérifie la session et la propriété du logement (lecture sous RLS : un logement qui n'est pas
 * à l'utilisateur n'est simplement pas visible). Renvoie le client, l'utilisateur, ou une réponse d'erreur.
 */
export async function exigerProprietaire(logementId: string) {
  const supabase = await clientServeur();
  if (!supabase) return { erreur: NextResponse.json({ message: "Supabase n'est pas configuré." }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ message: "Connexion requise." }, { status: 401 }) };
  const { data: logement } = await supabase.from("logements").select("id").eq("id", logementId).maybeSingle();
  if (!logement) return { erreur: NextResponse.json({ message: "Logement introuvable." }, { status: 404 }) };
  return { supabase, user };
}
