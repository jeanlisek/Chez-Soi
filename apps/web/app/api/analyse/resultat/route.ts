import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { clientAdmin } from "@/lib/supabase/server";

/**
 * POST /api/analyse/resultat : n8n (`pipeline_analyse`) renvoie ici le résultat du service vision
 * une fois l'analyse terminée. Appel serveur à serveur, authentifié par l'en-tête `X-Chez-Soi-Secret`
 * (même secret que les webhooks n8n). L'app écrit `failles`, `analyses` et `pieces` avec la clé
 * service_role. Idempotent : rejouer l'appel réécrit les mêmes lignes (identifiants déterministes).
 * Les cotes sont des estimations : `cote_confirmee_cm` n'est jamais écrite ici.
 */

const failleSchema = z.object({
  element: z.string().min(1),
  piece: z.string().nullish(),
  risque: z.enum(["chute", "intrusion", "incendie", "autre"]),
  cote_estimee_cm: z.number().nullish(),
  marge_cm: z.number().nullish(),
  largeur_cm: z.number().nullish(),
  longueur_cm: z.number().nullish(),
  hauteur_cm: z.number().nullish(),
  position_3d: z.unknown().optional(),
});

const entreeSchema = z.object({
  analyse_id: z.uuid(),
  logement_id: z.uuid(),
  etat: z.enum(["termine", "echec"]),
  resultat: z.enum(["pipeline", "precalcule"]).nullish(),
  service_analyse_id: z.string().nullish(),
  failles: z.array(z.unknown()).default([]),
  modele_3d_url: z.string().nullish(),
  erreur: z.string().nullish(),
});

function autorise(request: Request): boolean {
  const attendu = process.env.N8N_WEBHOOK_SECRET;
  const recu = request.headers.get("x-chez-soi-secret");
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Identifiant déterministe au format UUID (même algorithme que n8n, « 05 · Préparer les failles »). */
function idDeterministe(texte: string): string {
  let h = "";
  for (let k = 0; k < 4; k++) {
    let x = 0x811c9dc5;
    const s = `${k}:${texte}`;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    h += x.toString(16).padStart(8, "0");
  }
  const variante = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function POST(request: Request) {
  if (!autorise(request)) return NextResponse.json({ message: "Non autorisé." }, { status: 401 });
  const corps = entreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide.", details: corps.error.issues.slice(0, 3) }, { status: 400 });
  const e = corps.data;

  const admin = clientAdmin();
  if (!admin) return NextResponse.json({ message: "Écriture serveur non configurée." }, { status: 503 });

  const { data: analyse } = await admin
    .from("analyses")
    .select("id, logement_id, piece")
    .eq("id", e.analyse_id)
    .maybeSingle();
  if (!analyse || analyse.logement_id !== e.logement_id)
    return NextResponse.json({ message: "Analyse inconnue pour ce logement." }, { status: 404 });

  const { data: pieces } = await admin.from("pieces").select("id, nom").eq("logement_id", e.logement_id);
  const pieceParNom = (nom: string | null | undefined) =>
    (pieces ?? []).find((p) => p.nom.toLowerCase() === (nom ?? analyse.piece ?? "").toLowerCase());

  const retenues: Record<string, unknown>[] = [];
  let rejetees = 0;
  if (e.etat === "termine") {
    for (const brut of e.failles) {
      const f = failleSchema.safeParse(brut);
      if (!f.success) {
        rejetees++;
        continue;
      }
      const nomPiece = f.data.piece ?? analyse.piece ?? null;
      const centre = (f.data.position_3d as { centre?: unknown } | undefined)?.centre ?? null;
      retenues.push({
        id: idDeterministe([e.logement_id, f.data.element, nomPiece ?? "", JSON.stringify(centre)].join("|")),
        logement_id: e.logement_id,
        piece: nomPiece,
        piece_id: pieceParNom(nomPiece)?.id ?? null,
        risque: f.data.risque,
        element: f.data.element,
        source: "vision",
        // Le plan B garde les valeurs du pipeline ; l'origine précise est notée dans `analyses.resultat`.
        origine: f.data.cote_estimee_cm != null ? "pipeline" : null,
        cote_estimee_cm: f.data.cote_estimee_cm ?? null,
        marge_cm: f.data.marge_cm ?? null,
        largeur_cm: f.data.largeur_cm ?? null,
        longueur_cm: f.data.longueur_cm ?? null,
        hauteur_cm: f.data.hauteur_cm ?? null,
        position_3d: (f.data.position_3d as object | undefined) ?? null,
      });
    }
    if (retenues.length) {
      const { error } = await admin.from("failles").upsert(retenues as never, { onConflict: "id" });
      if (error) return NextResponse.json({ message: "Failles non écrites.", erreur: error.message }, { status: 500 });
    }
  }

  const resultat = {
    origine: e.resultat ?? null,
    service_analyse_id: e.service_analyse_id ?? null,
    modele_3d_url: e.modele_3d_url ?? null,
    failles_retenues: retenues.length,
    failles_rejetees: rejetees,
  };
  const maj = {
    fin: new Date().toISOString(),
    resultat,
    erreur: e.etat === "echec" ? (e.erreur ?? "Échec de l'analyse.") : null,
  };
  // Vocabulaire de `analyses.statut` : « terminee » (0008) ou « termine » (0009, aligné sur le Space).
  let statutEcrit = e.etat === "echec" ? "echec" : "termine";
  let { error: errMaj } = await admin.from("analyses").update({ ...maj, statut: statutEcrit }).eq("id", e.analyse_id);
  if (errMaj && e.etat === "termine") {
    statutEcrit = "terminee";
    ({ error: errMaj } = await admin.from("analyses").update({ ...maj, statut: statutEcrit }).eq("id", e.analyse_id));
  }
  if (errMaj) return NextResponse.json({ message: "Analyse non mise à jour.", erreur: errMaj.message }, { status: 500 });

  const piece = pieceParNom(analyse.piece);
  if (piece) await admin.from("pieces").update({ statut: e.etat === "termine" ? "ok" : "a_corriger" }).eq("id", piece.id);

  return NextResponse.json({ statut: "ok", failles_ecrites: retenues.length, failles_rejetees: rejetees, analyse: statutEcrit });
}
