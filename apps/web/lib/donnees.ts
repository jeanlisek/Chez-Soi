import "server-only";

import { LOGEMENT_EXEMPLE } from "@/lib/demo/logement-exemple";
import type { Logement } from "@/lib/domaine";

/**
 * Charge un logement pour l'interface. « exemple » sert le logement fictif de Marc et Jeanne,
 * visible sans compte. Les vrais logements sont lus dans Supabase (RLS : seul leur propriétaire
 * les voit) dès que la connexion est branchée ; sans cela, on renvoie null.
 */
export async function chargerLogement(id: string): Promise<Logement | null> {
  if (id === LOGEMENT_EXEMPLE.id) return LOGEMENT_EXEMPLE;
  return null;
}
