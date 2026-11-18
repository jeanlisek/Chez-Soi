import { NextResponse } from "next/server";
import { z } from "zod";

import { clientAdmin, clientServeur } from "@/lib/supabase/server";

const entreeSchema = z.object({ contrat_id: z.uuid() });

/** Contrat visible par l'utilisateur (RLS) : sinon 404, jamais le contrat d'un autre. */
async function contratDeLUtilisateur(contratId: string) {
  const supabase = await clientServeur();
  if (!supabase) return { erreur: NextResponse.json({ message: "Supabase n'est pas configuré." }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: NextResponse.json({ message: "Connexion requise." }, { status: 401 }) };
  const { data: contrat } = await supabase
    .from("contrats")
    .select("id, pdf_path, statut_extraction, assureur, formule, reference_cg, extrait_le")
    .eq("id", contratId)
    .maybeSingle();
  if (!contrat) return { erreur: NextResponse.json({ message: "Contrat introuvable." }, { status: 404 }) };
  return { supabase, contrat };
}

/**
 * POST /api/contrat : lance la lecture du contrat. L'app passe à n8n `analyse_contrat` une URL signée
 * du PDF (dix minutes) ; n8n appelle le service vision (`POST /contrat`, Docling), écrit
 * `obligations_contrat` et le graphe. Le PDF ne transite ni par n8n ni par l'agent.
 */
export async function POST(request: Request) {
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const verif = await contratDeLUtilisateur(corps.data.contrat_id);
  if ("erreur" in verif) return verif.erreur;
  const { contrat } = verif;
  if (!contrat.pdf_path) return NextResponse.json({ message: "Aucun PDF pour ce contrat." }, { status: 409 });

  const admin = clientAdmin();
  const n8n = process.env.N8N_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!admin || !n8n || !secret)
    return NextResponse.json({ statut_extraction: contrat.statut_extraction, message: "Lecture du contrat pas encore reliée." }, { status: 202 });

  const { data: lien } = await admin.storage.from("contrats").createSignedUrl(contrat.pdf_path, 600);
  if (!lien?.signedUrl) return NextResponse.json({ message: "PDF introuvable." }, { status: 404 });

  await admin.from("contrats").update({ statut_extraction: "en_cours" }).eq("id", contrat.id);
  try {
    const r = await fetch(`${n8n.replace(/\/$/, "")}/webhook/chez-soi/analyse-contrat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Chez-Soi-Secret": secret },
      body: JSON.stringify({ contrat_id: contrat.id, pdf_url: lien.signedUrl }),
      // La lecture est synchrone côté vision : on laisse du temps, dans la limite d'une fonction Vercel.
      signal: AbortSignal.timeout(55_000),
    });
    const retour = (await r.json().catch(() => ({}))) as { statut?: string; obligations_retenues?: number };
    if (r.status === 200) {
      await admin
        .from("contrats")
        .update({ statut_extraction: "termine", extrait_le: new Date().toISOString() })
        .eq("id", contrat.id);
      return NextResponse.json({ statut_extraction: "termine", obligations_retenues: retour.obligations_retenues ?? null });
    }
    if (r.status === 202) return NextResponse.json({ statut_extraction: "en_cours" }, { status: 202 });
    await admin.from("contrats").update({ statut_extraction: "echec" }).eq("id", contrat.id);
    return NextResponse.json({ statut_extraction: "echec", message: `Lecture refusée (${r.status}).` }, { status: 502 });
  } catch {
    // Délai dépassé : n8n peut encore finir et écrire ; l'état reste « en_cours ».
    return NextResponse.json({ statut_extraction: "en_cours", message: "Lecture en cours." }, { status: 202 });
  }
}

/** GET /api/contrat?id= : état de l'extraction et nombre de clauses retenues. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ message: "Identifiant invalide." }, { status: 400 });
  const verif = await contratDeLUtilisateur(id);
  if ("erreur" in verif) return verif.erreur;
  const { supabase, contrat } = verif;
  const { count } = await supabase
    .from("obligations_contrat")
    .select("id", { count: "exact", head: true })
    .eq("contrat_id", id);
  return NextResponse.json({
    statut_extraction: contrat.statut_extraction,
    assureur: contrat.assureur,
    formule: contrat.formule,
    reference_cg: contrat.reference_cg,
    obligations: count ?? 0,
  });
}

export const maxDuration = 60;
