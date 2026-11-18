import { NextResponse } from "next/server";

import { exigerProprietaire } from "@/lib/auth";
import { uploadTermineEntreeSchema, type UploadTermineSortie } from "@/lib/schemas";
import { clientAdmin } from "@/lib/supabase/server";

/**
 * POST /api/upload/termine : après l'envoi du fichier.
 * - Vidéo : la pièce est enregistrée, une ligne `analyses` est créée (écriture serveur),
 *   puis le workflow n8n `pipeline_analyse` reçoit `{ logement_id, video_url }` (URL signée d'une heure).
 * - Contrat : une ligne `contrats` est créée (extraction lancée par `/api/contrat`).
 */
export async function POST(request: Request) {
  const corps = uploadTermineEntreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const { logement_id, type, piece, path } = corps.data;

  const verif = await exigerProprietaire(logement_id);
  if ("erreur" in verif) return verif.erreur;
  const { supabase, user } = verif;
  if (!path.startsWith(`${user.id}/${logement_id}/`))
    return NextResponse.json({ message: "Chemin de fichier refusé." }, { status: 403 });

  if (type === "contrat") {
    const { data, error } = await supabase
      .from("contrats")
      .insert({ logement_id, pdf_path: path, titulaire_accord_le: new Date().toISOString(), statut_extraction: "en_attente" })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ message: "Contrat non enregistré." }, { status: 500 });
    const sortie: UploadTermineSortie = {
      analyse_id: null,
      contrat_id: data.id,
      declenche: false,
      message: "Contrat reçu. La lecture des clauses démarre.",
    };
    return NextResponse.json(sortie);
  }

  const nom = piece ?? "Pièce";
  const { data: existante } = await supabase
    .from("pieces")
    .select("id")
    .eq("logement_id", logement_id)
    .eq("nom", nom)
    .maybeSingle();
  if (!existante) await supabase.from("pieces").insert({ logement_id, nom, statut: "a_analyser" });
  else await supabase.from("pieces").update({ statut: "a_analyser" }).eq("id", existante.id);

  const admin = clientAdmin();
  if (!admin) return NextResponse.json({ message: "Écriture serveur non configurée." }, { status: 503 });

  const { data: analyse, error } = await admin
    .from("analyses")
    .insert({ logement_id, type: "video", piece: nom, entree_path: path, statut: "en_attente" })
    .select("id")
    .single();
  if (error || !analyse) return NextResponse.json({ message: "Analyse non enregistrée." }, { status: 500 });

  let declenche = false;
  let message = "Vidéo reçue. L'analyse démarrera dès que le service vision sera relié.";
  const n8n = process.env.N8N_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (n8n && secret) {
    const { data: lien } = await admin.storage.from("videos").createSignedUrl(path, 3600);
    if (lien?.signedUrl) {
      try {
        const r = await fetch(`${n8n.replace(/\/$/, "")}/webhook/chez-soi/analyse-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Chez-Soi-Secret": secret },
          body: JSON.stringify({ logement_id, video_url: lien.signedUrl, analyse_id: analyse.id, piece: nom }),
          signal: AbortSignal.timeout(8000),
        });
        declenche = r.status === 200 || r.status === 202;
        message = declenche ? "Vidéo reçue, analyse en cours." : `Vidéo reçue. Le service vision a répondu ${r.status}.`;
      } catch {
        message = "Vidéo reçue. Le service d'analyse ne répond pas pour l'instant.";
      }
    }
  }
  if (declenche)
    await admin.from("analyses").update({ statut: "en_cours", debut: new Date().toISOString() }).eq("id", analyse.id);

  const sortie: UploadTermineSortie = { analyse_id: analyse.id, contrat_id: null, declenche, message };
  return NextResponse.json(sortie);
}
