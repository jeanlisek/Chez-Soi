import "server-only";

import { LOGEMENT_EXEMPLE } from "@/lib/demo/logement-exemple";
import type { Action, Faille, Logement, Niveau, Occupant, Piece, Source } from "@/lib/domaine";
import { clientServeur } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Gravité 1 à 3 de la base → niveau affiché ; la priorité 1 d'une gravité 3 est « critique ». */
function niveau(gravite: number | null, priorite: number | null): Niveau {
  if (gravite === 3) return priorite === 1 ? "critique" : "eleve";
  if (gravite === 2) return "modere";
  return "surveiller";
}

function slug(nom: string) {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Libellés affichés des éléments (table `elements`), accents compris ; un code inconnu est affiché tel quel. */
const LIBELLES_ELEMENT: Record<string, string> = {
  fenetre: "Fenêtre",
  porte: "Porte",
  porte_entree: "Porte d'entrée",
  porte_interieure: "Porte intérieure",
  ressaut: "Ressaut ou seuil",
  eclairage: "Éclairage",
  garde_corps: "Garde-corps",
  barriere_securite: "Barrière de sécurité",
  barre_appui: "Barre d'appui",
  detecteur_fumee: "Détecteur de fumée",
  detecteur_co: "Détecteur de monoxyde de carbone",
  main_courante: "Main courante",
  marche: "Marche d'escalier",
};

/** Centre de l'élément dans le modèle 3D, seulement s'il est exprimé dans le repère du .glb. */
function repere3d(position: unknown): [number, number, number] | null {
  const p = position as { centre?: unknown; repere?: unknown } | null;
  const c = p?.centre;
  if (p?.repere !== "modele.glb" || !Array.isArray(c) || c.length !== 3 || !c.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return [c[0], c[1], c[2]];
}

/** « Photo en relief » du point (`position_3d.relief`, écrite par le service vision). */
function relief(position: unknown): { noeud: string; camera: [number, number, number]; cible: [number, number, number] } | null {
  const r = (position as { relief?: { noeud?: unknown; camera?: unknown; cible?: unknown } } | null)?.relief;
  const triplet = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!r || typeof r.noeud !== "string" || !/^vue_\d{1,4}$/.test(r.noeud) || !triplet(r.camera) || !triplet(r.cible)) return null;
  // Caméra et cible confondues : aucune direction de regard, on garde le nuage.
  if (Math.hypot(r.camera[0] - r.cible[0], r.camera[1] - r.cible[1], r.camera[2] - r.cible[2]) < 0.15) return null;
  return { noeud: r.noeud, camera: r.camera, cible: r.cible };
}

/** Tranche de la planche d'images qui montre ce point (`position_3d.vignette`, écrite par le service vision). */
function vignette(position: unknown): { index: number; total: number; largeur: number; hauteur: number; boite: [number, number, number, number] | null } | null {
  const v = (position as { vignette?: Record<string, unknown> } | null)?.vignette;
  if (!v) return null;
  const { index, total, largeur, hauteur } = v;
  const entiers = [index, total, largeur, hauteur].every((n) => typeof n === "number" && Number.isInteger(n));
  if (!entiers) return null;
  const [i, t, l, h] = [index, total, largeur, hauteur] as number[];
  if (!(i >= 0 && t > 0 && i < t && l > 0 && h > 0)) return null;
  const b = v.boite;
  const boite =
    Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1)
      ? (b as [number, number, number, number])
      : null;
  return { index: i, total: t, largeur: l, hauteur: h, boite };
}

/**
 * Charge un logement pour l'interface. « exemple » sert le logement fictif de Marc et Jeanne,
 * visible sans compte. Les autres sont lus dans Supabase au nom de l'utilisateur connecté :
 * la RLS garantit qu'il ne voit que son logement. Sinon : null (404).
 */
export async function chargerLogement(id: string): Promise<Logement | null> {
  if (id === LOGEMENT_EXEMPLE.id) return LOGEMENT_EXEMPLE;
  if (!UUID.test(id)) return null;
  const supabase = await clientServeur();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: l } = await supabase.from("logements").select("*").eq("id", id).maybeSingle();
  if (!l) return null;

  const [occ, pcs, ana, fls, acts, ctr, abs] = await Promise.all([
    supabase.from("occupants").select("*").eq("logement_id", id).order("created_at"),
    supabase.from("pieces").select("*").eq("logement_id", id).order("created_at"),
    supabase.from("analyses").select("*").eq("logement_id", id).eq("type", "video").order("created_at", { ascending: false }),
    supabase.from("failles").select("*").eq("logement_id", id),
    supabase
      .from("actions")
      .select("*, obligations_contrat(page, clause), regles(intitule, source_ref, source_url, force)")
      .order("priorite", { ascending: true }),
    supabase
      .from("contrats")
      .select("*, obligations_contrat(type, seuil, page, clause, texte_court)")
      .eq("logement_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("absences").select("*").eq("logement_id", id).order("created_at", { ascending: false }).limit(1),
  ]);

  const occupants: Occupant[] = (occ.data ?? []).map((o) => ({
    id: o.id,
    libelle: o.libelle,
    deplacement: Math.max(0, Math.min(4, o.deplacement)) as Occupant["deplacement"],
    vue_reduite: o.vue_reduite,
    audition_reduite: o.audition_reduite,
    troubles_memoire: o.vigilance === "troubles_cognitifs",
    consentement_art9_le: o.consentement_art9_le,
    nom: o.nom,
    naissance: o.naissance,
    contraintes: o.contraintes ?? [],
    autre: o.autre,
  }));
  const occupant: Occupant = occupants[0]
    ? occupants[0]
    : {
        libelle: "l'occupant",
        deplacement: 0,
        vue_reduite: false,
        audition_reduite: false,
        troubles_memoire: false,
        consentement_art9_le: null,
      };

  // Modèle 3D de chaque pièce : dernière analyse terminée qui a copié son .glb dans `modeles3d`.
  const cheminModele = (nom: string) =>
    (ana.data ?? []).find(
      (x) => x.piece === nom && x.statut === "termine" && (x.resultat as { modele_3d_path?: string } | null)?.modele_3d_path,
    )?.resultat as { modele_3d_path: string } | undefined;
  const chemins = [...new Set((pcs.data ?? []).map((p) => cheminModele(p.nom)?.modele_3d_path).filter(Boolean))] as string[];
  const signees = chemins.length
    ? (await supabase.storage.from("modeles3d").createSignedUrls(chemins, 3600)).data ?? []
    : [];
  const urlModele = (nom: string) => {
    const c = cheminModele(nom)?.modele_3d_path;
    return c ? (signees.find((s) => s.path === c)?.signedUrl ?? null) : null;
  };

  // Image annotée de chaque pièce : même analyse, bucket `exports`.
  const cheminImage = (nom: string) =>
    ((ana.data ?? []).find(
      (x) => x.piece === nom && x.statut === "termine" && (x.resultat as { image_annotee_path?: string } | null)?.image_annotee_path,
    )?.resultat as { image_annotee_path: string } | undefined)?.image_annotee_path;
  const cheminsImages = [...new Set((pcs.data ?? []).map((p) => cheminImage(p.nom)).filter(Boolean))] as string[];
  const imagesSignees = cheminsImages.length
    ? (await supabase.storage.from("exports").createSignedUrls(cheminsImages, 3600)).data ?? []
    : [];
  const urlImage = (nom: string) => {
    const c = cheminImage(nom);
    return c ? (imagesSignees.find((s) => s.path === c)?.signedUrl ?? null) : null;
  };

  // Une pièce sans aucune analyse n'a jamais été filmée (création d'un ancien parcours) : on ne l'affiche pas,
  // sinon l'accueil la montre « rien à signaler » et l'avancement compte une pièce qui n'arrivera jamais.
  const pieces: Piece[] = (pcs.data ?? []).filter((p) => (ana.data ?? []).some((x) => x.piece === p.nom)).map((p) => {
    const a = (ana.data ?? []).find((x) => x.piece === p.nom);
    const statut = a?.statut;
    return {
      id: p.id,
      nom: p.nom,
      modele_url: urlModele(p.nom),
      image_url: urlImage(p.nom),
      analyse:
        statut === "termine" || statut === "terminee"
          ? "terminee"
          : statut === "echec"
            ? "echec"
            : statut === "en_cours"
              ? "en_cours"
              : "en_attente",
    };
  });

  const failleIds = new Set((fls.data ?? []).map((f) => f.id));
  const actionsLogement = (acts.data ?? []).filter((a) => a.faille_id && failleIds.has(a.faille_id));

  const sourceAction = (a: (typeof actionsLogement)[number] | undefined): Source => {
    const ob = a?.obligations_contrat as { page: number; clause: string | null } | null | undefined;
    const rg = a?.regles as { intitule: string; source_ref: string | null; source_url: string | null; force: string } | null | undefined;
    if (a?.force === "contrat" && ob) return { force: "contrat", clause: ob.clause ?? "Clause du contrat", page: ob.page };
    if (a?.force === "loi" && rg?.source_url) return { force: "loi", reference: rg.source_ref ?? rg.intitule, url: rg.source_url };
    if (!a) return { force: "recommande", reference: "Repéré : aucune règle ne demande d'action" };
    return { force: "recommande", reference: rg?.intitule ? `Recommandé · ${rg.intitule}` : "Recommandé" };
  };

  // Le modèle 3D et l'image d'une pièce viennent de sa dernière analyse terminée. Un point gardé d'une analyse
  // plus ancienne (cote confirmée) n'a ni le même repère ni la même image : on ne lui en attribue pas.
  const debutDerniereAnalyse = (nom: string | null) => {
    const a = (ana.data ?? []).find((x) => x.piece === nom && x.statut === "termine");
    return a ? Date.parse(a.debut ?? a.created_at) : null;
  };
  const deLaDerniereAnalyse = (f: { piece: string | null; created_at: string }) => {
    const debut = debutDerniereAnalyse(f.piece);
    return debut != null && Date.parse(f.created_at) >= debut;
  };

  const failles: Faille[] = (fls.data ?? []).map((f) => {
    const a = actionsLogement.find((x) => x.faille_id === f.id);
    const piece = pieces.find((p) => p.id === f.piece_id) ?? pieces.find((p) => p.nom === f.piece);
    return {
      id: f.id,
      piece_id: piece?.id ?? slug(f.piece ?? "logement"),
      repere_3d: deLaDerniereAnalyse(f) ? repere3d(f.position_3d) : null,
      vignette: deLaDerniereAnalyse(f) ? vignette(f.position_3d) : null,
      relief: deLaDerniereAnalyse(f) ? relief(f.position_3d) : null,
      titre: LIBELLES_ELEMENT[f.element] ?? f.element.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      element: f.element,
      risque: f.risque,
      niveau: niveau(f.gravite, f.priorite),
      description: a?.explication ?? "Point repéré sur votre vidéo. Aucune règle (contrat, loi ou recommandation) ne demande d'action pour ce logement et ses habitants : il reste à surveiller.",
      source: sourceAction(a),
      cote:
        f.largeur_cm != null && f.longueur_cm != null
          ? {
              libelle: "Dimensions",
              // La vision estime au millimètre ; l'écran et l'agent travaillent au centimètre.
              largeur_cm: Math.round(Number(f.largeur_cm)),
              longueur_cm: Math.round(Number(f.longueur_cm)),
              statut: f.cotes_confirmees_le ? "confirmee" : "a_confirmer",
            }
          : undefined,
      origine: f.origine === "manuel" ? "manuel" : "pipeline",
      statut: a?.statut === "fait" ? "regle" : a?.statut === "en_cours" ? "en_traitement" : "a_traiter",
    };
  });

  const actions: Action[] = actionsLogement.map((a, i) => {
    const f = failles.find((x) => x.id === a.faille_id)!;
    const source = sourceAction(a);
    return {
      id: a.id,
      faille_id: a.faille_id!,
      priorite: a.priorite ?? i + 1,
      titre: a.contre_mesure,
      niveau: f.niveau,
      source,
      detail: source.force === "contrat" ? `Exigé par votre contrat · p. ${source.page}` : source.force === "loi" ? source.reference : "Recommandé",
      mission: a.usage === 3 ? "Prépare la démarche, sans rien envoyer." : "Compare les produits compatibles et vérifie la dimension sur chaque fiche.",
      usage: (a.usage as 1 | 2 | 3 | null) ?? null,
      groupe: (a.priorite ?? i + 1) <= 3 ? "priorite" : "plus_tard",
    };
  });

  const c = ctr.data?.[0];
  type Ob = { type: string; seuil: number | null; page: number; clause: string | null; texte_court: string | null };
  const inocc = (c?.obligations_contrat as Ob[] | undefined)?.find((x) => x.type === "inoccupation" && x.seuil != null);
  const contrat =
    c && c.assureur
      ? {
          assureur: c.assureur,
          formule: c.formule ?? "",
          reference_cg: c.reference_cg ?? "",
          inoccupation: inocc
            ? {
                duree_max_jours: Number(inocc.seuil),
                protections: (c.obligations_contrat as Ob[])
                  .filter((x) => x.type === "prevention" && x.texte_court)
                  .map((x) => x.texte_court!),
                clause: inocc.clause ?? "Inoccupation",
                page: inocc.page,
              }
            : undefined,
        }
      : null;

  const a = abs.data?.[0];
  const nomAidant =
    (user.user_metadata?.given_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    "vous";

  return {
    id: l.id,
    exemple: false,
    aidant: nomAidant,
    occupant,
    occupants,
    adresse: l.adresse ?? null,
    type: l.type ?? "Logement",
    etage: l.etage == null ? "—" : l.etage === 0 ? "RDC" : `${l.etage}e`,
    ascenseur: l.ascenseur ?? null,
    statut:
      l.statut_occupation === "proprietaire" ? "Propriétaire" : l.statut_occupation === "locataire" ? "Locataire" : l.statut_occupation === "heberge" ? "Hébergé" : "—",
    zone_otv: l.zone_otv === "gendarmerie" ? "gendarmerie" : "police",
    contrat,
    pieces,
    failles,
    actions,
    absence: a ? { depart_le: a.depart_le, retour_le: a.retour_le, motif: "" } : null,
  };
}
