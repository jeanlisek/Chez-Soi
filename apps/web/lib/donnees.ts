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
    supabase.from("occupants").select("*").eq("logement_id", id).order("created_at").limit(1),
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

  const o = occ.data?.[0];
  const occupant: Occupant = o
    ? {
        libelle: o.libelle,
        deplacement: Math.max(0, Math.min(4, o.deplacement)) as Occupant["deplacement"],
        vue_reduite: o.vue_reduite,
        audition_reduite: o.audition_reduite,
        troubles_memoire: o.vigilance === "troubles_cognitifs",
        consentement_art9_le: o.consentement_art9_le,
      }
    : {
        libelle: "l'occupant",
        deplacement: 0,
        vue_reduite: false,
        audition_reduite: false,
        troubles_memoire: false,
        consentement_art9_le: null,
      };

  const pieces: Piece[] = (pcs.data ?? []).map((p) => {
    const a = (ana.data ?? []).find((x) => x.piece === p.nom);
    const statut = a?.statut;
    return {
      id: p.id,
      nom: p.nom,
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
    return { force: "recommande", reference: rg?.intitule ? `Recommandé · ${rg.intitule}` : "Recommandé" };
  };

  const failles: Faille[] = (fls.data ?? []).map((f) => {
    const a = actionsLogement.find((x) => x.faille_id === f.id);
    const piece = pieces.find((p) => p.id === f.piece_id) ?? pieces.find((p) => p.nom === f.piece);
    return {
      id: f.id,
      piece_id: piece?.id ?? slug(f.piece ?? "logement"),
      titre: f.element.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      element: f.element,
      risque: f.risque,
      niveau: niveau(f.gravite, f.priorite),
      description: a?.explication ?? "Point repéré sur votre vidéo.",
      source: sourceAction(a),
      cote:
        f.largeur_cm != null && f.longueur_cm != null
          ? {
              libelle: "Dimensions",
              largeur_cm: Number(f.largeur_cm),
              longueur_cm: Number(f.longueur_cm),
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
    type: l.type ?? "Logement",
    etage: l.etage == null ? "—" : l.etage === 0 ? "RDC" : `${l.etage}e`,
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
