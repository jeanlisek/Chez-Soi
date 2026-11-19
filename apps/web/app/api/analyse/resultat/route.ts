import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { calculerPlan } from "@/lib/plan";
import { clientAdmin } from "@/lib/supabase/server";

/**
 * POST /api/analyse/resultat : n8n (`pipeline_analyse`) renvoie ici le résultat du service vision
 * une fois l'analyse terminée. Appel serveur à serveur, authentifié par l'en-tête `X-Chez-Soi-Secret`
 * (même secret que les webhooks n8n). L'app écrit `failles`, `analyses` et `pieces` avec la clé
 * service_role. Idempotent : rejouer l'appel réécrit les mêmes lignes (identifiants déterministes).
 * Les points d'une analyse remplacent ceux des analyses précédentes de la même pièce.
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
  /** Chemin du .glb copié par n8n dans le bucket `modeles3d` (voir /api/analyse/modele-url). */
  modele_3d_path: z.string().nullish(),
  /** Chemin de l'image annotée copiée par n8n dans le bucket `exports` (même route). */
  image_annotee_path: z.string().nullish(),
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

const PRESENCE = new Set(["serrure", "escalier", "eclairage", "detecteur_fumee"]);

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
        // Un point retrouvé à l'identique garde son identifiant : sa date suit la dernière analyse, sinon l'app
        // le prendrait pour un point d'une ancienne analyse et ne lui donnerait ni photo ni vue 3D.
        created_at: new Date().toISOString(),
      });
    }
    // Éléments repérés sans cote (serrure, plafonnier, détecteur, escalier) : c'est leur présence dans la pièce
    // qui compte, pas leur nombre. Sur les vraies vidéos, le détecteur en trouve plusieurs par pièce, souvent
    // sur une seule image. On n'en garde qu'un par pièce et par élément, vu sur au moins 2 images (3 pour un
    // escalier, souvent confondu avec un meuble). L'interrupteur n'a aucune règle : il n'est pas gardé.
    {
      const nbVues = (r: Record<string, unknown>) => Number((r.position_3d as { nb_vues?: number } | null)?.nb_vues ?? 0);
      const meilleurs = new Map<string, Record<string, unknown>>();
      for (const r of retenues) {
        const el = r.element as string;
        if (!PRESENCE.has(el)) continue;
        const cle = `${r.piece ?? ""}|${el}`;
        const actuel = meilleurs.get(cle);
        if (!actuel || nbVues(r) > nbVues(actuel)) meilleurs.set(cle, r);
      }
      const gardes = new Set([...meilleurs.values()].filter((r) => nbVues(r) >= (r.element === "escalier" ? 3 : 2)));
      for (let i = retenues.length - 1; i >= 0; i--) {
        const el = retenues[i].element as string;
        if (el === "interrupteur" || (PRESENCE.has(el) && !gardes.has(retenues[i]))) {
          retenues.splice(i, 1);
          rejetees++;
        }
      }
    }
    // Un point dont l'utilisateur a confirmé la cote, retrouvé par la nouvelle analyse (même pièce, même
    // élément, taille proche), garde son identifiant et sa cote : sinon le même tapis apparaît deux fois,
    // l'ancien confirmé et le nouveau à confirmer. Les repères 3D changent d'une analyse à l'autre : on
    // compare donc les tailles, pas les positions.
    if (analyse.piece && retenues.length) {
      const { data: confirmes } = await admin
        .from("failles")
        .select("id, element, largeur_cm, longueur_cm, hauteur_cm, cote_confirmee_cm")
        .eq("logement_id", e.logement_id)
        .eq("piece", analyse.piece)
        .eq("source", "vision")
        .not("cote_confirmee_cm", "is", null);
      const pris = new Set<string>();
      for (const c of confirmes ?? []) {
        if (retenues.some((r) => r.id === c.id)) continue;
        const ref = [c.largeur_cm, c.longueur_cm ?? c.cote_confirmee_cm].filter((x): x is number => x != null);
        let meilleur: { r: Record<string, unknown>; ecart: number } | null = null;
        for (const r of retenues) {
          if (r.element !== c.element || pris.has(r.id as string)) continue;
          const tailles = [r.largeur_cm, r.longueur_cm ?? r.cote_estimee_cm].filter((x): x is number => typeof x === "number");
          if (tailles.length !== ref.length || !ref.length) continue;
          const ecart = Math.max(...ref.map((v, i) => Math.abs(v - tailles[i]) / v));
          if (ecart <= 0.3 && (!meilleur || ecart < meilleur.ecart)) meilleur = { r, ecart };
        }
        if (!meilleur) continue;
        pris.add(meilleur.r.id as string);
        Object.assign(meilleur.r, {
          id: c.id,
          largeur_cm: c.largeur_cm,
          longueur_cm: c.longueur_cm,
          hauteur_cm: c.hauteur_cm,
        });
      }
    }
    if (retenues.length) {
      const { error } = await admin.from("failles").upsert(retenues as never, { onConflict: "id" });
      if (error) return NextResponse.json({ message: "Failles non écrites.", erreur: error.message }, { status: 500 });
    }
    // Une pièce refilmée remplace ses anciens points : sans cela, chaque nouvelle analyse en ajoute
    // et le même tapis apparaît deux fois. On garde les points dont l'utilisateur a confirmé la cote.
    // Leurs actions et diagnostics partent avec eux (clés étrangères en cascade) ; le plan est recalculé plus bas.
    if (analyse.piece) {
      const gardees = retenues.map((r) => r.id as string);
      let suppression = admin
        .from("failles")
        .delete()
        .eq("logement_id", e.logement_id)
        .eq("piece", analyse.piece)
        .eq("source", "vision")
        .is("cote_confirmee_cm", null);
      if (gardees.length) suppression = suppression.not("id", "in", `(${gardees.join(",")})`);
      const { error: errSuppr } = await suppression;
      if (errSuppr) console.error("[analyse/resultat] anciens points non retirés", errSuppr.message);
    }
  }

  // On ne garde que le chemin prévu pour ce logement et cette analyse : rien d'autre ne s'écrit.
  const { data: proprio } = await admin.from("logements").select("user_id").eq("id", e.logement_id).single();
  const attendu = proprio ? `${proprio.user_id}/${e.logement_id}/${e.analyse_id}.glb` : null;
  const modelePath = e.etat === "termine" && e.modele_3d_path && e.modele_3d_path === attendu ? attendu : null;
  if (modelePath) await admin.from("logements").update({ modele_3d_path: modelePath }).eq("id", e.logement_id);
  const imageAttendue = proprio ? `${proprio.user_id}/${e.logement_id}/${e.analyse_id}.jpg` : null;
  const imagePath = e.etat === "termine" && e.image_annotee_path && e.image_annotee_path === imageAttendue ? imageAttendue : null;

  const resultat = {
    origine: e.resultat ?? null,
    service_analyse_id: e.service_analyse_id ?? null,
    modele_3d_url: e.modele_3d_url ?? null,
    modele_3d_path: modelePath,
    image_annotee_path: imagePath,
    failles_retenues: retenues.length,
    failles_rejetees: rejetees,
  };
  // Une analyse vidéo terminée doit porter son origine (contrainte `analyses_video_terminee_origine`) :
  // « pipeline » par défaut, « precalcule » quand le Space a servi le plan B.
  const statutEcrit = e.etat === "echec" ? "echec" : "termine";
  const maj = {
    statut: statutEcrit,
    fin: new Date().toISOString(),
    resultat,
    origine: e.etat === "termine" ? (e.resultat ?? "pipeline") : (e.resultat ?? null),
    service_analyse_id: e.service_analyse_id ?? null,
    erreur: e.etat === "echec" ? (e.erreur ?? "Échec de l'analyse.") : null,
  };
  const { error: errMaj } = await admin.from("analyses").update(maj).eq("id", e.analyse_id);
  if (errMaj) return NextResponse.json({ message: "Analyse non mise à jour.", erreur: errMaj.message }, { status: 500 });

  const piece = pieceParNom(analyse.piece);
  if (piece) await admin.from("pieces").update({ statut: e.etat === "termine" ? "ok" : "a_corriger" }).eq("id", piece.id);

  // Plan d'action recalculé dès que de nouvelles failles arrivent (issue #13). Un échec ici
  // n'annule pas l'analyse : le plan peut être relancé par POST /api/plan.
  let plan: Awaited<ReturnType<typeof calculerPlan>> | { erreur: string } | null = null;
  if (e.etat === "termine") {
    try {
      plan = await calculerPlan(admin, e.logement_id);
    } catch (err) {
      plan = { erreur: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ statut: "ok", failles_ecrites: retenues.length, failles_rejetees: rejetees, analyse: statutEcrit, plan });
}

export const maxDuration = 60;
