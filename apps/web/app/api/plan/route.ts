import { NextResponse } from "next/server";
import { z } from "zod";

import { exigerProprietaire } from "@/lib/auth";
import { calculerPlan } from "@/lib/plan";
import { clientAdmin } from "@/lib/supabase/server";

/**
 * POST /api/plan { logement_id } : recalcule le plan d'action du logement (failles + règles en
 * vigueur + contrat → `actions` et `diagnostic_regles`). Le verdict est calculé sur les règles,
 * jamais par un LLM (voir `lib/plan.ts`). Appelé aussi après chaque analyse et chaque profil.
 */
const entree = z.object({ logement_id: z.uuid() });

export async function POST(request: Request) {
  const corps = entree.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "logement_id manquant." }, { status: 400 });

  const acces = await exigerProprietaire(corps.data.logement_id);
  if ("erreur" in acces) return acces.erreur;

  const admin = clientAdmin();
  if (!admin) return NextResponse.json({ message: "Écriture serveur non configurée." }, { status: 503 });

  try {
    const resultat = await calculerPlan(admin, corps.data.logement_id);
    return NextResponse.json({ statut: "ok", ...resultat });
  } catch (e) {
    return NextResponse.json({ message: "Plan non calculé.", erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
