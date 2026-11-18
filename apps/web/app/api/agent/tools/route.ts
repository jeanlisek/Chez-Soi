import { NextResponse } from "next/server";
import { z } from "zod";

import { contexteAgent, reponseErreur } from "@/lib/agent/contexte";
import { repondreValidation } from "@/lib/agent/serveur";

const entreeSchema = z.object({
  validation_id: z.uuid(),
  decision: z.enum(["approuve", "refuse", "modifier"]),
  message: z.string().trim().max(500).optional(),
});

/**
 * POST /api/agent/tools : réponse de l'utilisateur au custom tool `demander_validation`
 * (clic dans ValidationModal). C'est le seul outil qui attend l'utilisateur : get_mesures et
 * get_contrat sont répondus par le serveur dès le webhook `awaiting_tool_results`
 * (`lib/agent/outils.ts`). La réponse part à H seulement ici, après le clic.
 */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const contexte = await contexteAgent();
  if ("erreur" in contexte) return contexte.erreur;
  try {
    await repondreValidation({
      ...contexte,
      validationId: corps.data.validation_id,
      decision: corps.data.decision,
      message: corps.data.message,
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
