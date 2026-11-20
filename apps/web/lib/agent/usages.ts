import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CheminsAutorises } from "../../../../agents/dev/boucle";
import { controlerSortieUsage1, controlerSortieUsage2, evaluerSortie, type Evaluation } from "../../../../agents/dev/controle";
import { estFicheAutorisee, preuvesSurFiche } from "../../../../agents/dev/fiche";
import { artisansDe, sansDimension, sortieUsage1Schema, sortieUsage2Schema, sortieUsage3Schema, sortieUsage4Schema, versJsonSchema, type SortieUsage3, type SortieUsage4 } from "@/lib/schemas";
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
  usage: 1 | 2 | 3 | 4;
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
    const { contrat, assureur } = await contratEtAssureur(admin, logementId);
    // Les conditions générales ne sont souvent liées d'aucune page publique (MAIF : « accessibles à
    // l'étape du devis ») : l'agent finissait dans l'espace client et le coupe-circuit l'arrêtait
    // (run du 20/11). Départ par une recherche limitée au site officiel, qui trouve le PDF public.
    const domaine = assureur.domaines[0];
    const accueil = assureur.url_depart ?? `https://www.${domaine}`;
    const requete = `site:${domaine} conditions générales ${contrat.reference_cg ?? ""} pdf`.replace(/\s+/g, " ");
    const urlDepart = `https://duckduckgo.com/?q=${encodeURIComponent(requete)}`;
    return {
      site: domaine,
      urlDepart,
      consigne: [
        `La page de départ est une recherche limitée au site officiel ${domaine}. N'ouvre que des résultats dont l'adresse est sur ${domaine}. Si elle ne donne rien, va sur ${accueil} et cherche une page de documents. N'ouvre jamais l'espace client, « Se connecter » ou « Mon espace » : les conditions générales sont publiques.`,
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

/**
 * Sites marchands comparés par l'usage 2, selon l'élément. Seuls IKEA et Castorama passent les trois
 * conditions (essais du 20/11) : le navigateur de l'agent n'est pas bloqué (Leroy Merlin, ManoMano et
 * Boulanger le bloquent), le panier ne demande ni compte ni magasin (Brico Dépôt et Bricomarché
 * exigent de choisir un magasin, donc une localisation), et le code peut relire la fiche.
 */
type SiteMarchand = { nom: string; site: string; urlDepart: string };
const IKEA: SiteMarchand = { nom: "IKEA", site: "www.ikea.com/fr/fr", urlDepart: "https://www.ikea.com/fr/fr" };
const CASTORAMA: SiteMarchand = { nom: "Castorama", site: "www.castorama.fr", urlDepart: "https://www.castorama.fr" };
const SITES_PAR_ELEMENT: Record<string, SiteMarchand[]> = {
  // IKEA France ne vend pas de détecteur de fumée.
  detecteur_fumee: [{ ...CASTORAMA, urlDepart: "https://www.castorama.fr/electricite/detecteur-de-fumee/cat_id_3163.cat" }],
};
export function sitesPourElement(element: string | null | undefined): SiteMarchand[] {
  return SITES_PAR_ELEMENT[element ?? ""] ?? [IKEA, CASTORAMA];
}

const usage2: DefinitionUsage = {
  usage: 2,
  agent: "chez-soi-acheteur:2",
  formatReponse: versJsonSchema(sortieUsage2Schema),
  action: "faille",
  // IKEA France et Castorama : accueil, recherche, rayons, fiche produit et panier. Rien d'autre.
  // Castorama pour ce qu'IKEA ne vend pas (détecteur de fumée) ; Leroy Merlin bloque les navigateurs
  // automatisés (HTTP 403 dès la recherche, essai du 20/11).
  cheminsAutorises: [
    { hote: "ikea.com", exacts: ["/fr/fr"], prefixes: ["/fr/fr/search", "/fr/fr/cat/", "/fr/fr/p/", "/fr/fr/shoppingcart"] },
    { hote: "castorama.fr", exacts: ["/"], prefixes: ["/search", "/basket"], suffixes: ["_cafr.prd", ".cat"] },
  ],
  preparer: async (admin, _logementId, action) => {
    // La contre-mesure du plan dit QUOI chercher (« Sous-tapis antidérapant 50 × 80 cm ») : sans elle,
    // l'agent choisit un produit de la bonne taille mais pas forcément du bon type (run du 19/11).
    const { data } = action
      ? await admin.from("actions").select("contre_mesure, failles(element)").eq("id", action.id).maybeSingle()
      : { data: null };
    const element = (data?.failles as { element: string } | null)?.element;
    const libre = sansDimension(element);
    const sites = sitesPourElement(element);
    const { urlDepart } = sites[0];
    const site = sites.map((x) => x.site).join(" et ");
    // Deux sites : l'agent compare et ne met au panier qu'un seul produit, le moins cher qui convient.
    const comparer =
      sites.length > 1
        ? ` Compare sur ${sites.map((x) => x.site).join(" puis sur ")} : regarde au moins un produit compatible sur chaque site, puis mets au panier un seul produit, le moins cher qui respecte les contraintes, sur le site où il est vendu. Dans remarque, indique le produit retenu sur l'autre site et son prix.`
        : "";
    // Le type seul, sans les dimensions du libellé (« … 38 × 59 cm ») : données telles quelles, l'agent
    // les a prises pour le nom du produit et a écarté un sous-tapis plus grand à découper (run du 19/11).
    // Les cotes viennent de get_mesures et la règle de dimension de la skill verifier-dimension.
    const recherche = data?.contre_mesure?.replace(/\s+\d+(?:[.,]\d+)?\s*×\s*\d+(?:[.,]\d+)?\s*cm\s*$/i, "").trim();
    return {
      site,
      urlDepart,
      consigne: [
        recherche
          ? `Trouve sur ${sites.length > 1 ? "les sites" : "le site"} ${site} un produit de ce type : « ${recherche} » (c'est une catégorie de produit, pas un nom exact), pour corriger la faille ${action?.faille_id} du logement.${comparer} Mets-le au panier, puis arrête-toi et demande la validation. Ne propose pas un autre type de produit ; si aucun site n'en vend de ce type, dis-le.${libre ? "" : " Un produit plus grand que la cote convient s'il respecte ta règle de découpe."}`
          : `Trouve sur ${site} un équipement compatible avec la faille ${action?.faille_id} du logement, mets-le au panier, puis arrête-toi et demande la validation.`,
        libre
          ? `Appelle d'abord get_mesures avec faille_id = "${action?.faille_id}" pour connaître les contraintes de l'occupant. Ce produit n'a aucune dimension à respecter : ne vérifie aucune cote, laisse largeur_cm, longueur_cm et citation_decoupe vides, et choisis selon le type demandé et ces contraintes.`
          : `Appelle d'abord get_mesures avec faille_id = "${action?.faille_id}" pour connaître les cotes et les contraintes de l'occupant.`,
        libre
          ? "Applique tes règles permanentes : panier comme dernière page, demander_validation avec action « panier », puis plus aucune action et la réponse finale au format demandé."
          : "Applique tes règles permanentes : vérification de la dimension sur la fiche, panier comme dernière page, demander_validation avec action « panier », puis plus aucune action et la réponse finale au format demandé.",
      ].join("\n"),
    };
  },
  evaluer: async (admin, run, reponse) => {
    // Cote de la faille du run (et pas le tapis de démo) pour juger la dimension du produit.
    let cote: { largeur_cm: number; longueur_cm: number } | undefined;
    let libre = false;
    if (run.action_id) {
      const { data: action } = await admin
        .from("actions")
        .select("failles(element, largeur_cm, longueur_cm, cote_confirmee_cm)")
        .eq("id", run.action_id)
        .maybeSingle();
      const f = action?.failles as { element: string; largeur_cm: number | null; longueur_cm: number | null; cote_confirmee_cm: number | null } | null;
      libre = sansDimension(f?.element);
      // Jamais `hauteur_cm` ici : pour un tapis, c'est l'épaisseur (contrat de la PR #46).
      const largeur = f?.largeur_cm ?? f?.cote_confirmee_cm;
      const longueur = f?.longueur_cm ?? f?.cote_confirmee_cm;
      if (largeur && longueur) cote = { largeur_cm: largeur, longueur_cm: longueur };
    }
    const evaluation = evaluerSortie(reponse, sortieUsage2Schema, (s) => controlerSortieUsage2(s, cote, libre));
    const sortie = evaluation.sortie;
    if (!sortie?.trouve) return evaluation as Evaluation<unknown>;
    // Un lien de recherche ou de panier ne prouve rien (run du 20/11 : lien = page de recherche IKEA).
    if (!sortie.lien || !estFicheAutorisee(sortie.lien)) {
      return {
        ...evaluation,
        ecarts_metier: [...evaluation.ecarts_metier, `lien « ${sortie.lien ?? "absent"} » : pas une fiche produit autorisée, aucune preuve, produit à REFUSER`],
      } as Evaluation<unknown>;
    }
    // Contrôle v2 (19/11) : le code relit la fiche et y cherche lui-même les preuves. La recopie de
    // l'agent (nom, citation) n'est plus jugée : seule la page compte. Sans phrase de découpe sur la
    // fiche, un produit plus grand que la cote reste refusé ; des dimensions absentes de la fiche aussi.
    const preuves = await preuvesSurFiche(sortie.lien, sortie);
    if (preuves.erreur) {
      return { ...evaluation, ecarts_metier: [...evaluation.ecarts_metier, `fiche illisible (${preuves.erreur}) : aucune preuve, produit à REFUSER`] } as Evaluation<unknown>;
    }
    const ecarts = evaluation.ecarts_metier.filter((e) => !(preuves.phrase_decoupe && /citation_decoupe/.test(e)));
    // Sans dimension à respecter (veilleuse, détecteur), seule la lecture de la fiche compte.
    if (!libre && !preuves.dimensions_sur_fiche) ecarts.push(`dimensions ${sortie.largeur_cm} × ${sortie.longueur_cm} cm introuvables sur la fiche : produit à REFUSER`);
    return {
      ...evaluation,
      brut: { ...(evaluation.brut as object), preuves_fiche: preuves },
      ecarts_metier: ecarts,
    } as Evaluation<unknown>;
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
        `3. Avec un contrat, trouve sur le site officiel de l'assureur comment le prévenir d'une absence (contact, téléphone, espace adhérent), sans entrer dans aucun espace client. Si ${duree} jours dépasse duree_max_jours renvoyé par get_contrat, l'information de l'assureur est exigée par le contrat : écris « exigée par le contrat » avec la clause et la page, jamais « facultatif ». Sinon, elle est recommandée. Sans contrat : rédige un court message prêt à envoyer et mets assureur_trouve à false.`,
        "4. Rédige le récapitulatif à relire, en texte simple sans mise en forme Markdown : dates, durée, seuil du contrat et protections à mettre en place s'il y en a, démarches et liens.",
        "5. Obligatoire avant ta réponse finale : appelle demander_validation avec action « envoi », un résumé d'une ou deux phrases et l'adresse de la page officielle de l'OTV. Puis plus aucune action, et la réponse finale au format demandé.",
      ].join("\n"),
    };
  },
  evaluer: async (_admin, _run, reponse) => evaluerSortie(reponse, sortieUsage3Schema, controlerSortieUsage3) as Evaluation<unknown>,
};

/* ---------- Usage 4 : artisans pour les travaux (lecture seule, aucun contact) ---------- */

/** Code postal et commune tirés de l'adresse saisie. Jamais la rue : seule la commune part chez l'agent. */
export function communeDe(adresse: string | null | undefined): string | null {
  // Le dernier code postal de l'adresse, puis la ville qui le suit jusqu'à la virgule (« 75011 Paris, France »).
  const m = [...(adresse ?? "").matchAll(/\b(\d{5})\b([^,;\n]{0,60})/gu)].at(-1);
  if (!m) return null;
  const ville = m[2].trim().replace(/[.,;]+$/, "");
  return ville ? `${m[1]} ${ville}` : m[1];
}

/** Corps de métier à chercher pour un élément du logement. */
export function metierPour(element: string | null | undefined): string {
  switch (element) {
    case "serrure":
      return "serrurier (pose de serrure multipoints, porte blindée)";
    case "porte":
      return "menuisier ou entreprise d'adaptation du logement (élargissement de porte)";
    case "fenetre":
      return "menuisier ou serrurier (fermetures et volets)";
    case "escalier":
    case "main_courante":
      return "menuisier ou serrurier-métallier (main courante, garde-corps)";
    case "ressaut":
    case "seuil":
      return "menuisier ou entreprise d'adaptation du logement (rampe de seuil, suppression de ressaut)";
    default:
      return "artisan du bâtiment";
  }
}

/**
 * Ce que les travaux doivent permettre, tiré des capacités des occupants. Rien qui décrive une
 * personne : seulement des contraintes sur le chantier (même principe que get_mesures).
 */
export function contraintesTravaux(occupants: { deplacement: number }[], locataire: boolean, element?: string | null): string[] {
  // Le passage ne compte que pour les travaux qui le modifient (porte, escalier, seuil) : pas pour une serrure (run du 19/11).
  const passage = ["porte", "porte_entree", "porte_interieure", "escalier", "seuil", "ressaut"].includes(element ?? "");
  const max = passage ? Math.max(0, ...occupants.map((o) => o.deplacement)) : 0;
  const c: string[] = [];
  if (max >= 4) c.push("Les travaux doivent permettre le passage d'un fauteuil roulant : privilégie un artisan qui affiche le label Handibat ou une expérience de l'adaptation du logement.");
  else if (max === 3) c.push("Les travaux doivent permettre le passage d'un déambulateur : privilégie un artisan qui affiche le label Handibat ou une expérience de l'adaptation du logement.");
  else if (max >= 1) c.push("Une personne qui marche avec difficulté vit dans le logement : le chantier doit laisser un passage dégagé.");
  if (locataire) c.push("Le logement est loué : signale dans le message de devis que l'accord du propriétaire sera demandé avant les travaux.");
  return c;
}

/** Écarts de la réponse de l'usage 4 : au moins un artisan, chacun avec un lien web lisible. */
export function controlerSortieUsage4(sortie: SortieUsage4): string[] {
  const ecarts: string[] = [];
  const artisans = artisansDe(sortie as Record<string, unknown>);
  if (sortie.trouve && artisans.length === 0) ecarts.push("trouve = true sans aucun artisan");
  for (const a of artisans) {
    let ok = false;
    try {
      ok = ["http:", "https:"].includes(new URL(a.lien ?? "").protocol);
    } catch {
      ok = false;
    }
    if (!ok) ecarts.push(`${a.nom} : page source absente ou illisible`);
  }
  if (artisans.length && !sortie.message_devis?.trim()) ecarts.push("message de devis absent");
  if (sortie.message_devis && /@|\b0[1-9](?:[ .]?\d{2}){4}\b/.test(sortie.message_devis)) ecarts.push("message de devis avec une coordonnée");
  return ecarts;
}

const usage4: DefinitionUsage = {
  usage: 4,
  agent: "chez-soi-artisans:1",
  formatReponse: versJsonSchema(sortieUsage4Schema),
  action: "faille",
  // Lecture seule : en plus des motifs par défaut, aucune page de demande de devis ou de rendez-vous.
  motifsEnPlus: ["rendez", "rdv"],
  preparer: async (admin, logementId, action) => {
    const [{ data: logement }, { data: occupants }, { data: detail }] = await Promise.all([
      admin.from("logements").select("adresse, statut_occupation").eq("id", logementId).maybeSingle(),
      admin.from("occupants").select("deplacement").eq("logement_id", logementId),
      action
        ? admin.from("actions").select("contre_mesure, failles(element, piece, cote_confirmee_cm, largeur_cm, hauteur_cm)").eq("id", action.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const commune = communeDe(logement?.adresse);
    if (!commune) throw new ErreurRoute(409, "Indiquez l'adresse du logement avec son code postal dans le profil : l'agent cherche des artisans près de la commune.");
    const f = detail?.failles as { element: string; piece: string | null; cote_confirmee_cm: number | null; largeur_cm: number | null; hauteur_cm: number | null } | null;
    const travaux = detail?.contre_mesure ?? "Travaux de sécurité du logement";
    const dimensions =
      f?.cote_confirmee_cm != null
        ? `Dimension confirmée : ${f.largeur_cm ?? f.cote_confirmee_cm} cm de large${f.hauteur_cm ? ` sur ${f.hauteur_cm} cm de haut` : ""}.`
        : "Aucune dimension confirmée : l'artisan mesurera sur place.";
    const contraintes = contraintesTravaux(occupants ?? [], logement?.statut_occupation === "locataire", f?.element);
    return {
      site: "recherche web",
      urlDepart: `https://duckduckgo.com/?q=${encodeURIComponent(`${metierPour(f?.element).split(" (")[0]} ${commune}`)}`,
      consigne: [
        `Trouve jusqu'à trois artisans qui peuvent réaliser ces travaux près de ${commune} : « ${travaux} »${f?.piece ? ` (pièce : ${f.piece})` : ""}.`,
        `Corps de métier : ${metierPour(f?.element)}. ${dimensions}`,
        ...contraintes,
        "Tu ne contactes personne et tu n'envoies aucun formulaire. Rédige le message de demande de devis que l'utilisateur enverra lui-même, puis rends ta réponse finale au format demandé.",
      ].join("\n"),
    };
  },
  evaluer: async (_admin, _run, reponse) => evaluerSortie(reponse, sortieUsage4Schema, controlerSortieUsage4) as Evaluation<unknown>,
};

export const USAGES: Partial<Record<1 | 2 | 3 | 4, DefinitionUsage>> = { 1: usage1, 2: usage2, 3: usage3, 4: usage4 };

export function definitionUsage(usage: number): DefinitionUsage | null {
  return USAGES[usage as 1 | 2 | 3 | 4] ?? null;
}
