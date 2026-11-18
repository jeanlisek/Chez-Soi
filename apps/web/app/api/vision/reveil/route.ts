import { NextResponse } from "next/server";
import { z } from "zod";

import { exigerProprietaire } from "@/lib/auth";

const entreeSchema = z.object({ logement_id: z.uuid() });

/**
 * Réveil du Space vision. Le Space Hugging Face se met en veille après 30 min et met plusieurs minutes
 * à redémarrer : l'app le réveille dès que l'utilisateur ouvre l'écran Contrat ou Capture, pour qu'il
 * soit prêt quand la vidéo arrive. Passe par le webhook n8n `reveil_vision` (qui a déjà la clé du Space) :
 * aucune clé Hugging Face côté Vercel. Ne transmet aucune donnée personnelle.
 */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const verif = await exigerProprietaire(corps.data.logement_id);
  if ("erreur" in verif) return verif.erreur;

  const n8n = process.env.N8N_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!n8n || !secret) return NextResponse.json({ reveil: false, message: "n8n non configuré." }, { status: 503 });
  const r = await fetch(`${n8n.replace(/\/$/, "")}/webhook/chez-soi/reveil-vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Chez-Soi-Secret": secret },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return NextResponse.json({ reveil: Boolean(r && (r.status === 200 || r.status === 202)) });
}
