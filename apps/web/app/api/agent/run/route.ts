import { NextResponse } from "next/server";
import { z } from "zod";

import { contexteAgent, reponseErreur } from "@/lib/agent/contexte";
import { creerRun, lireRun } from "@/lib/agent/serveur";

const entreeSchema = z.object({
  logement_id: z.uuid(),
  usage: z.number().int().min(1).max(3),
  /** Une session par action (usages 2 et 3). L'écran Plan d'action envoie la liste : on lance la première. Usage 1 : aucune. */
  action_ids: z.array(z.uuid()).default([]),
});

/**
 * POST /api/agent/run : crée une session H pour une action du logement (usage 1, 2 ou 3) et
 * écrit sa ligne `runs_agent`. La suite arrive par le webhook H (`/api/webhooks/hai`).
 * Une seule session à la fois par appel : 429 si le quota de l'équipe est plein.
 */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const contexte = await contexteAgent();
  if ("erreur" in contexte) return contexte.erreur;
  try {
    const run = await creerRun({
      ...contexte,
      logementId: corps.data.logement_id,
      usage: corps.data.usage,
      actionId: corps.data.action_ids[0] ?? null,
    });
    return NextResponse.json({ ...run, actions_en_attente: corps.data.action_ids.slice(1) }, { status: 201 });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}

/** GET /api/agent/run?id=<session_id> : état du run et validation en attente (RLS). */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Paramètre id requis." }, { status: 400 });
  const contexte = await contexteAgent();
  if ("erreur" in contexte) return contexte.erreur;
  try {
    return NextResponse.json(await lireRun(contexte.utilisateur, id, contexte.admin, contexte.hai));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
