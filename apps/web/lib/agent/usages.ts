import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CheminsAutorises } from "../../../../agents/dev/boucle";
import { controlerSortieUsage1, controlerSortieUsage2, evaluerSortie, type Evaluation } from "../../../../agents/dev/controle";
import { sortieUsage1Schema, sortieUsage2Schema, sortieUsage3Schema, versJsonSchema, type SortieUsage3 } from "@/lib/schemas";
import type { Database } from "@/lib/supabase/types";

import { verifierCgUsage1 } from "./contrat_cg";
import { ErreurRoute } from "./erreurs";

type Admin = SupabaseClient<Database>;

/**
 * Ce que l'application sait de chaque usage de l'agent H. Les règles permanentes (aucune
 * connexion, panier comme dernière page, aucun envoi…) et la déclaration des custom tools
 * vivent dans l'agent maison créé sur H (`agents/definitions/`, figé sur `nom:N`) : la session
 * ne porte que la tâche, le format de réponse et la page de départ.
 *
 * Usage 3 : il s'ajoute ici avec la PR #21, sous la même forme.
 */
export type RunUsage = { session_id: string; logement_id: string; action_id: string | null };
export type ActionRun = { id: string; faille_id: string | null; absence_id: string | null } | null;
export type Preparation = { site: string; urlDepart: string; consigne: string };

export type DefinitionUsage = {
  usage: 1 | 2 | 3;
  /** Agent maison sur H, révision figée. */
  agent: string;
  formatReponse: Record<string, unknown>;
  /** Origine de l'action exigée : faille (usage 2), absence (usage 3), aucune (usage 1, lecture seule). */
  action: "faille" | "absence" | null;
  preparer: (admin: Admin, logementId: string, action: ActionRun) => Promise<Preparation>;
  evaluer: (admin: Admin, run: RunUsage, reponse: unknown) => Promise<Evaluation<unknown>>;
  /** Après la fin : colonnes `runs_agent` en plus (usage 1 : `controle_document`). */
  apresFin?: (
    admin: Admin,
    run: RunUsage,
    evaluation: Evaluation<unknown>,
  ) => Promise<Partial<Database["public"]["Tables"]["runs_agent"]["Update"]>>;
  /** Mots d'URL qui déclenchent le coupe-circuit, en plus des motifs par défaut. */
  motifsEnPlus?: string[];
  /** Motifs par défaut retirés pour cet usage. */
  motifsEnMoins?: string[];
  /** Liste blanche des pages pour la démo : toute autre page déclenche le coupe-circuit. */
  cheminsAutorises?: CheminsAutorises;
};

/* ---------- Contrat et assureur du logement ---------- */

async function contratEtAssureur(admin: Admin, logementId: string) {
  const { data: contrat } = await admin
    .from("contrats")
    .select("id, reference_cg, assureur, assureurs(nom, domaines, url_depart)")
    .eq("logement_id", logementId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!contrat) throw new ErreurRoute(409, "Aucun contrat pour ce logement : l'usage 1 en a besoin.");
  const assureur = contrat.assureurs as { nom: string; domaines: string[]; url_depart: string | null } | null;
  if (!assureur?.domaines?.length) throw new ErreurRoute(409, "Contrat sans assureur du référentiel (contrats.assureur_id).");
  return { contrat, assureur };
}

/* ---------- Usage 1 : conditions générales (lecture seule) ---------- */

const usage1: DefinitionUsage = {
  usage: 1,
  agent: "chez-soi-sourcing:1",
  formatReponse: versJsonSchema(sortieUsage1Schema),
  action: null,
  preparer: async (admin, logementId) => {
    const { assureur } = await contratEtAssureur(admin, logementId);
    const urlDepart = assureur.url_depart ?? `https://www.${assureur.domaines[0]}`;
    return {
      site: new URL(urlDepart).hostname,
      urlDepart,
      consigne: [
        `Retrouve, sur le site officiel de l'assureur, les conditions générales du contrat d'assurance habitation du logement ${logementId}, et renvoie leur adresse.`,
        `Appelle d'abord get_contrat avec logement_id = "${logementId}" et champs = ["assureur", "formule", "reference_cg"].`,
        "Rends ta réponse dès que tu as l'adresse des conditions générales. La fiche d'information est facultative : donne-la seulement si son lien est sur la même page. Dans reference_trouvee, le code de référence lu (jamais le nom du fichier). Si le document n'est pas public, trouve = false avec la raison.",
      ].join("\n"),
    };
  },
  evaluer: async (admin, run, reponse) => {
    const { contrat, assureur } = await contratEtAssureur(admin, run.logement_id);
    return evaluerSortie(reponse, sortieUsage1Schema, (s) =>
      controlerSortieUsage1(s, { domaines: assureur.domaines, reference: contrat.reference_cg ?? "" }),
    ) as Evaluation<unknown>;
  },
  apresFin: async (admin, run, evaluation) => {
    const controle = await verifierCgUsage1(admin, run, evaluation);
    return controle ? { controle_document: controle } : {};
  },
};

/* ---------- Usage 2 : objets (arrêt au panier) ---------- */

const usage2: DefinitionUsage = {
  usage: 2,
  agent: "chez-soi-acheteur:2",
  formatReponse: versJsonSchema(sortieUsage2Schema),
  action: "faille",
  // IKEA France : accueil, recherche, catégories, fiche produit et panier. Rien d'autre.
  cheminsAutorises: [
    { hote: "ikea.com", exacts: ["/fr/fr"], prefixes: ["/fr/fr/search", "/fr/fr/cat/", "/fr/fr/p/", "/fr/fr/shoppingcart"] },
  ],
  preparer: async (admin, _logementId, action) => {
    // La contre-mesure du plan dit QUOI chercher (« Sous-tapis antidérapant 50 × 80 cm ») : sans elle,
    // l'agent choisit un produit de la bonne taille mais pas forcément du bon type (run du 19/11).
    const { data } = action ? await admin.from("actions").select("contre_mesure").eq("id", action.id).maybeSingle() : { data: null };
    // Le type seul, sans les dimensions du libellé (« … 38 × 59 cm ») : données telles quelles, l'agent
    // les a prises pour le nom du produit et a écarté un sous-tapis plus grand à découper (run du 19/11).
    // Les cotes viennent de get_mesures et la règle de dimension de la skill verifier-dimension.
    const recherche = data?.contre_mesure?.replace(/\s+\d+(?:[.,]\d+)?\s*×\s*\d+(?:[.,]\d+)?\s*cm\s*$/i, "").trim();
    return {
      site: "www.ikea.com/fr/fr",
      urlDepart: "https://www.ikea.com/fr/fr",
      consigne: [
        recherche
          ? `Trouve sur le site www.ikea.com/fr/fr un produit de ce type : « ${recherche} » (c'est une catégorie de produit, pas un nom exact), pour corriger la faille ${action?.faille_id} du logement. Mets-le au panier, puis arrête-toi et demande la validation. Ne propose pas un autre type de produit ; si le site n'en vend aucun de ce type, dis-le. Un produit plus grand que la cote convient s'il respecte ta règle de découpe.`
          : `Trouve sur le site www.ikea.com/fr/fr un équipement compatible avec la faille ${action?.faille_id} du logement, mets-le au panier, puis arrête-toi et demande la validation.`,
        `Appelle d'abord get_mesures avec faille_id = "${action?.faille_id}" pour connaître les cotes et les contraintes de l'occupant.`,
        "Applique tes règles permanentes : vérification de la dimension sur la fiche, panier comme dernière page, demander_validation avec action « panier », puis plus aucune action et la réponse finale au format demandé.",
      ].join("\n"),
    };
  },
  evaluer: async (admin, run, reponse) => {
    // Cote de la faille du run (et pas le tapis de démo) pour juger la dimension du produit.
    let cote: { largeur_cm: number; longueur_cm: number } | undefined;
    if (run.action_id) {
      const { data: action } = await admin
        .from("actions")
        .select("failles(largeur_cm, longueur_cm, cote_confirmee_cm)")
        .eq("id", run.action_id)
        .maybeSingle();
      const f = action?.failles as { largeur_cm: number | null; longueur_cm: number | null; cote_confirmee_cm: number | null } | null;
      // Jamais `hauteur_cm` ici : pour un tapis, c'est l'épaisseur (contrat de la PR #46).
      const largeur = f?.largeur_cm ?? f?.cote_confirmee_cm;
      const longueur = f?.longueur_cm ?? f?.cote_confirmee_cm;
      if (largeur && longueur) cote = { largeur_cm: largeur, longueur_cm: longueur };
    }
    return evaluerSortie(reponse, sortieUsage2Schema, (s) => controlerSortieUsage2(s, cote)) as Evaluation<unknown>;
  },
};

/* ---------- Usage 3 : démarches d'absence (préparer sans connexion, arrêt avant tout envoi) ---------- */

const DOMAINES_OTV = ["service-public.gouv.fr", "service-public.fr", "interieur.gouv.fr"];

/** Écarts de la réponse de l'usage 3 : démarche OTV sur un site de l'État, récapitulatif présent, arrêt demandé. */
export function controlerSortieUsage3(sortie: SortieUsage3): string[] {
  const ecarts: string[] = [];
  if (!sortie.otv_trouve) ecarts.push("démarche OTV non trouvée");
  else {
    let hote = "";
    try {
      hote = new URL(sortie.otv_url_demarche ?? "").hostname.toLowerCase();
    } catch {
      hote = "";
    }
    if (!DOMAINES_OTV.some((d) => hote === d || hote.endsWith(`.${d}`))) ecarts.push("otv_url_demarche hors d'un site officiel de l'État");
  }
  if (!sortie.recapitulatif?.trim()) ecarts.push("récapitulatif absent");
  if (!sortie.validation_demandee) ecarts.push("demander_validation (action envoi) non appelé");
  return ecarts;
}

const usage3: DefinitionUsage = {
  usage: 3,
  agent: "chez-soi-demarches:1",
  formatReponse: versJsonSchema(sortieUsage3Schema),
  // Démarches du logement entier : les dates viennent de la dernière ligne `absences` (écrite par /api/absence).
  action: null,
  preparer: async (admin, logementId) => {
    const { data: absence } = await admin
      .from("absences")
      .select("depart_le, retour_le")
      .eq("logement_id", logementId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!absence) throw new ErreurRoute(409, "Aucune absence enregistrée pour ce logement : indiquez d'abord les dates.");
    const duree = Math.round((Date.parse(absence.retour_le) - Date.parse(absence.depart_le)) / 86_400_000);
    return {
      site: "www.service-public.gouv.fr",
      urlDepart: "https://www.service-public.gouv.fr/particuliers/vosdroits/F34634",
      consigne: [
        `L'occupant du logement ${logementId} s'absente du ${absence.depart_le} au ${absence.retour_le} (${duree} jours). Un proche fera lui-même les démarches : prépare-les pour qu'il n'ait plus qu'à se connecter, relire et envoyer. Tu n'as aucun identifiant, tu ne te connectes nulle part et tu n'envoies rien.`,
        `1. Appelle d'abord get_contrat avec logement_id = "${logementId}" et champs = ["assureur", "inoccupation", "absence"]. S'il n'y a pas de contrat ou pas de clause d'inoccupation, dis-le tel quel, sans inventer de seuil.`,
        "2. Sur service-public.gouv.fr, trouve la page officielle de la démarche « Opération tranquillité vacances ». Relève comment se connecter, les informations et pièces demandées et le délai d'inscription, tels qu'affichés. Ne clique pas sur le bouton qui ouvre le service en ligne (page de connexion) : donne l'adresse de la page officielle.",
        "3. Avec un contrat, trouve sur le site officiel de l'assureur comment le prévenir d'une absence (contact, téléphone, espace adhérent), sans entrer dans aucun espace client. Précise si l'information est exigée par le contrat (clause, page) ou facultative. Sans contrat : rédige un court message prêt à envoyer et mets assureur_trouve à false.",
        "4. Rédige le récapitulatif à relire, en texte simple sans mise en forme Markdown : dates, durée, seuil du contrat et protections à mettre en place s'il y en a, démarches et liens.",
        "5. Obligatoire avant ta réponse finale : appelle demander_validation avec action « envoi », un résumé d'une ou deux phrases et l'adresse de la page officielle de l'OTV. Puis plus aucune action, et la réponse finale au format demandé.",
      ].join("\n"),
    };
  },
  evaluer: async (_admin, _run, reponse) => evaluerSortie(reponse, sortieUsage3Schema, controlerSortieUsage3) as Evaluation<unknown>,
};

export const USAGES: Partial<Record<1 | 2 | 3, DefinitionUsage>> = { 1: usage1, 2: usage2, 3: usage3 };

export function definitionUsage(usage: number): DefinitionUsage | null {
  return USAGES[usage as 1 | 2 | 3] ?? null;
}
