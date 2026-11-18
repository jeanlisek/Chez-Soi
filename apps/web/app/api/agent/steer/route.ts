import { NextResponse } from "next/server";
import { z } from "zod";

import { contexteAgent, reponseErreur } from "@/lib/agent/contexte";
import { envoyerConsigne } from "@/lib/agent/serveur";

const entreeSchema = z.object({
  session_id: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/agent/steer : consigne de l'utilisateur à une session en cours (ex. « moins de
 * 50 € »), journalisée dans `messages_agent` puis envoyée à H (`POST /sessions/{id}/messages`).
 * Refusée si la session est terminée : un message la relancerait et la referait facturer.
 */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const contexte = await contexteAgent();
  if ("erreur" in contexte) return contexte.erreur;
  try {
    const resultat = await envoyerConsigne({ ...contexte, sessionId: corps.data.session_id, contenu: corps.data.message });
    return NextResponse.json(resultat, { status: 202 });
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
