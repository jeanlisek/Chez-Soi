import { NextResponse } from "next/server";
import { z } from "zod";

import { contexteAgent, reponseErreur } from "@/lib/agent/contexte";
import { arreterSession } from "@/lib/agent/serveur";

const entreeSchema = z.object({ session_id: z.string().min(1) });

/** POST /api/agent/stop : l'utilisateur arrête l'agent ; la session H est annulée. */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const contexte = await contexteAgent();
  if ("erreur" in contexte) return contexte.erreur;
  try {
    return NextResponse.json(await arreterSession({ ...contexte, sessionId: corps.data.session_id }));
  } catch (erreur) {
    return reponseErreur(erreur);
  }
}
