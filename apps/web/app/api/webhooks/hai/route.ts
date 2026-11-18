import { after, NextResponse } from "next/server";
import { z } from "zod";

import { traiterSession } from "@/lib/agent/serveur";
import { verifierSignatureHai } from "@/lib/agent/signature";
import { creerClientHai } from "@/lib/hai";
import { clientAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** https://hub.hcompany.ai/agents-api/webhooks/events.md : même forme pour tous les types. */
const evenementSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  data: z.object({ session_id: z.string(), status: z.string().nullish() }).loose(),
});

const TYPES_TRAITES = new Set([
  "session.awaiting_tool_results",
  "session.completed",
  "session.failed",
  "session.timed_out",
  "session.idle",
  "session.status_updated",
]);

/**
 * POST /api/webhooks/hai : livraisons de webhooks H (niveau organisation).
 * 1. Signature vérifiée sur le corps brut (`H_WEBHOOK_SECRET`) ; sinon 400, rien n'est écrit.
 * 2. Doublons ignorés : `webhooks_recus.livraison_id` (en-tête `X-H-Webhook-Delivery`) est unique.
 * 3. Réponse 200 tout de suite (H attend au plus 10 s), traitement ensuite avec `after()` :
 *    la livraison n'est qu'un déclencheur, l'état fait foi est relu chez H (`traiterSession`).
 * L'URL doit être publique en https : la production, pas une preview protégée (401).
 */
export async function POST(request: Request) {
  const secret = process.env.H_WEBHOOK_SECRET;
  const admin = clientAdmin();
  if (!secret || !admin || !process.env.H_API_KEY) {
    return NextResponse.json({ message: "Webhook H non configuré." }, { status: 503 });
  }

  const corpsBrut = await request.text();
  const verification = verifierSignatureHai({
    corpsBrut,
    signature: request.headers.get("x-h-webhook-signature"),
    horodatage: request.headers.get("x-h-webhook-timestamp"),
    secret,
  });
  if (!verification.valide) return NextResponse.json({ message: verification.raison }, { status: 400 });

  const livraisonId = request.headers.get("x-h-webhook-delivery");
  let evenement: z.infer<typeof evenementSchema>;
  try {
    evenement = evenementSchema.parse(JSON.parse(corpsBrut));
  } catch {
    return NextResponse.json({ message: "Événement illisible." }, { status: 400 });
  }
  if (!livraisonId) return NextResponse.json({ message: "En-tête X-H-Webhook-Delivery absent." }, { status: 400 });

  const { data: inseree, error: erreurBase } = await admin
    .from("webhooks_recus")
    .upsert(
      {
        livraison_id: livraisonId,
        evenement_id: evenement.id ?? null,
        type: evenement.type,
        session_id: evenement.data.session_id,
        signature_valide: true,
      },
      { onConflict: "livraison_id", ignoreDuplicates: true },
    )
    .select("id");
  // Base indisponible : 503 pour que H relivre plus tard (au moins une fois, 8 tentatives sur 24 h).
  if (erreurBase) return NextResponse.json({ message: "Journal des webhooks indisponible." }, { status: 503 });
  if (!inseree || inseree.length === 0) return NextResponse.json({ doublon: true });

  if (TYPES_TRAITES.has(evenement.type)) {
    const ligneId = inseree[0].id;
    after(async () => {
      try {
        const bilan = await traiterSession(admin, creerClientHai(), evenement.data.session_id);
        await admin.from("webhooks_recus").update({ traite_le: new Date().toISOString(), erreur: null }).eq("id", ligneId);
        console.info(`[webhook H] ${evenement.type} ${evenement.data.session_id} : ${bilan}`);
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message.slice(0, 500) : "erreur";
        await admin.from("webhooks_recus").update({ erreur: message }).eq("id", ligneId);
        console.error(`[webhook H] ${evenement.type} ${evenement.data.session_id}`, erreur);
      }
    });
  }
  return NextResponse.json({ recu: true });
}
