import "server-only";

import { NextResponse } from "next/server";

import { creerClientHai, HaiErreur } from "@/lib/hai";
import { clientAdmin, clientServeur } from "@/lib/supabase/server";

import { ErreurRoute } from "./erreurs";

/**
 * Ce dont une route agent a besoin : l'utilisateur connecté (client sous RLS), le client
 * service_role pour les écritures réservées au serveur, et le client H (`H_API_KEY`).
 * Renvoie une réponse d'erreur si l'un manque.
 */
export async function contexteAgent() {
  const utilisateur = await clientServeur();
  const admin = clientAdmin();
  if (!utilisateur || !admin) {
    return { erreur: NextResponse.json({ message: "Supabase n'est pas configuré." }, { status: 503 }) };
  }
  if (!process.env.H_API_KEY) {
    return { erreur: NextResponse.json({ message: "L'agent H n'est pas configuré (H_API_KEY)." }, { status: 503 }) };
  }
  const {
    data: { user },
  } = await utilisateur.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ message: "Connexion requise." }, { status: 401 }) };
  return { utilisateur, admin, hai: creerClientHai() };
}

/** Erreur → réponse JSON. Ne renvoie jamais le détail brut de l'API H (ni clé, ni lien de session). */
export function reponseErreur(erreur: unknown) {
  if (erreur instanceof ErreurRoute) return NextResponse.json({ message: erreur.message }, { status: erreur.statut });
  if (erreur instanceof HaiErreur) {
    const statut = erreur.statut === 429 ? 429 : 502;
    return NextResponse.json({ message: statut === 429 ? "L'agent H est occupé : réessayez." : "L'agent H n'a pas répondu correctement." }, { status: statut });
  }
  console.error("[agent]", erreur);
  return NextResponse.json({ message: "Erreur interne." }, { status: 500 });
}
