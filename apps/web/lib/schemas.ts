import { z } from "zod";

import { OUTCOMES } from "./hai";

/**
 * Schémas Zod partagés (convention du projet : tout schéma d'échange vit ici).
 * Squelette : seuls le stub commun et le contrat d'interface des custom tools
 * (repris tel quel du CLAUDE.md) sont décrits. Aucun schéma de base de données.
 */

/** Réponse commune des routes API tant qu'elles ne sont pas implémentées. */
export const stubReponseSchema = z.object({
  stub: z.literal(true),
  route: z.string(),
  methode: z.enum(["GET", "POST"]),
  message: z.string(),
});
export type StubReponse = z.infer<typeof stubReponseSchema>;

/* ---------- Custom tools de l'agent H (contrat d'interface) ---------- */

export const getMesuresEntreeSchema = z.object({
  faille_id: z.string(),
});
export const getMesuresSortieSchema = z.object({
  element: z.string(),
  piece: z.string(),
  cote_confirmee_cm: z.number(),
  largeur_cm: z.number(),
  /** Hauteur d'une porte ou d'une fenêtre, épaisseur d'un tapis ; absente si inconnue. */
  hauteur_cm: z.number().optional(),
  /** Longueur au sol (tapis, couloir) : `failles.longueur_cm`, depuis la migration 0006. */
  longueur_cm: z.number().optional(),
  /** Contraintes concrètes sur l'objet, jamais l'âge, la santé ni la mobilité (RGPD art. 9). */
  contraintes_profil: z.array(z.string()),
});

/** Ne renvoie que les champs demandés, jamais le PDF ni l'adresse. */
export const getContratEntreeSchema = z.object({
  logement_id: z.string(),
  champs: z.array(z.string()),
});
export const getContratSortieSchema = z.object({
  assureur: z.string(),
  formule: z.string(),
  reference_cg: z.string().optional(),
  inoccupation: z
    .object({
      duree_max_jours: z.number(),
      protections: z.array(z.string()),
      /** `obligations_contrat.clause` peut être vide en base : sans intitulé, la page reste la référence. */
      clause: z.string().nullish(),
      page: z.number(),
    })
    .optional(),
  /**
   * Clauses liées à l'absence sans durée d'inoccupation (migration 0010, PR #34) : franchise,
   * prévention… `source` vaut `cg` pour une citation réelle des conditions générales, `cp`
   * pour les conditions particulières (fictives pour la persona de démo).
   */
  absence: z
    .array(
      z.object({
        type: z.string(),
        element: z.string().optional(),
        valeur: z.number().optional(),
        unite: z.string().optional(),
        texte: z.string(),
        /** Peut manquer : la RPC retire les valeurs nulles. */
        clause: z.string().nullish(),
        page: z.number(),
        source: z.enum(["cg", "cp"]),
      }),
    )
    .optional(),
});

export const demanderValidationEntreeSchema = z.object({
  action: z.enum(["panier", "envoi"]),
  resume: z.string(),
  produit: z.string().optional(),
  montant_eur: z.number().optional(),
  url: z.string().optional(),
});
export const demanderValidationSortieSchema = z.object({
  decision: z.enum(["approuve", "refuse", "modifier"]),
  message: z.string().optional(),
});

/* ---------- Usage 2 (objets) : réponse finale de l'agent ---------- */

/**
 * Réponse finale de l'usage 2, demandée à l'agent en sortie structurée
 * (`agent.answer_format`). Seuls `trouve` et `au_panier` sont obligatoires, pour que
 * l'agent puisse dire « rien trouvé » sans inventer.
 *
 * Schéma PLAT, sans objet imbriqué : au premier run (18/11), `h/web-surfer-flash` a
 * envoyé l'objet `dimensions` sous forme de chaîne, s'est fait rejeter quatre fois, puis
 * a rendu `null` à la place et perdu la donnée. D'où `largeur_cm` et `longueur_cm`.
 */
export const sortieUsage2Schema = z.object({
  trouve: z.boolean().describe("Vrai si un produit compatible avec le besoin, le profil et les contraintes confirmées a été trouvé."),
  au_panier: z.boolean().describe("Vrai si le produit a été ajouté au panier."),
  produit: z.string().optional().describe("Nom exact du produit."),
  categorie: z.string().optional().describe("Catégorie d’objet ou équipement recherchée."),
  piece: z.string().optional().describe("Pièce du logement concernée."),
  mode_compatibilite: z.enum(["encombrement", "couverture", "fixation", "fonctionnelle", "mixte", "inconnue"]).optional().describe("Type de contrôle adapté au produit ; aucune règle de tapis imposée aux autres objets."),
  prix_eur: z.number().optional().describe("Prix TTC en euros, hors livraison."),
  largeur_cm: z.number().optional().describe("Largeur du produit lue sur la fiche, en centimètres."),
  longueur_cm: z.number().optional().describe("Longueur du produit lue sur la fiche, en centimètres."),
  hauteur_cm: z.number().positive().optional().describe("Hauteur du produit en cm si pertinente et confirmée sur la fiche."),
  profondeur_cm: z.number().positive().optional().describe("Profondeur du produit en cm si pertinente et confirmée sur la fiche."),
  diametre_cm: z.number().positive().optional().describe("Diamètre du produit ou de son interface en cm si pertinent."),
  lien: z.string().optional().describe("URL de la fiche produit."),
  delai_livraison: z.string().optional().describe("Délai de livraison affiché, tel quel."),
  citation_dimensions: z.string().optional().describe("Passage exact de la fiche attestant les dimensions du produit sélectionné."),
  citation_compatibilite: z.string().optional().describe("Passage exact prouvant une propriété décisive, par exemple fixation, alimentation, culot ou usage."),
  citation_decoupe: z.string().optional().describe("Phrase exacte de la fiche autorisant la découpe ; obligatoire si le produit est plus grand que la cote."),
  remarque: z.string().optional().describe("Écart, doute ou raison de l'échec."),
});
export type SortieUsage2 = z.infer<typeof sortieUsage2Schema>;

/** Champs attendus pour le banc historique TAPIS. Ce contrôle ne doit pas être appliqué aux autres catégories. */
export const CHAMPS_ATTENDUS_USAGE_2 = [
  "produit",
  "prix_eur",
  "largeur_cm",
  "longueur_cm",
  "lien",
  "delai_livraison",
] as const satisfies readonly (keyof SortieUsage2)[];

/* ---------- Usage 1 (sourcing) : réponse finale de l'agent ---------- */

/**
 * Réponse finale de l'usage 1 (issue #7). Schéma plat, comme l'usage 2. Seul `trouve` est
 * obligatoire, pour que l'agent puisse dire « non publié » sans inventer d'adresse.
 * L'`outcome` et `reference_trouvee` sont des déclarations de l'agent : le code télécharge
 * le PDF et contrôle lui-même la référence (`controle_document` du run).
 */
export const sortieUsage1Schema = z.object({
  trouve: z.boolean().describe("Vrai si les conditions générales de la bonne formule ont été trouvées sur le site de l'assureur."),
  url_cg: z.string().optional().describe("Adresse complète du document des conditions générales, de préférence le PDF."),
  url_fiche_information: z.string().optional().describe("Adresse de la fiche d'information (IPID), si elle existe."),
  reference_trouvee: z
    .string()
    .optional()
    .describe("Code de référence du document lu écrit sur la page ou dans le document (ex. M2442), jamais le nom du fichier. Vide si non vu."),
  titre: z.string().optional().describe("Titre du document ou du lien, tel qu'affiché."),
  date_version: z.string().optional().describe("Date ou édition du document, si elle est affichée."),
  raison: z.string().optional().describe("Raison de l'échec, ou doute utile."),
});
export type SortieUsage1 = z.infer<typeof sortieUsage1Schema>;

/** Contrôle du document par le code, après le run de l'usage 1. */
export const controleDocumentSchema = z.object({
  url: z.string(),
  url_finale: z.string().nullable(),
  domaine_officiel: z.boolean(),
  telecharge: z.boolean(),
  est_pdf: z.boolean(),
  octets: z.number().nullable(),
  sha256: z.string().nullable(),
  /** `trouvee` : la référence attendue est dans le texte du PDF ; `absente` : le texte est lisible mais ne la contient pas ; `non_verifiable` : texte non extrait (polices encodées), contrôle à refaire par Docling ou à la main. */
  reference: z.enum(["trouvee", "absente", "non_verifiable"]).nullable(),
  reference_attendue: z.string(),
  fichier_local: z.string().nullable(),
  erreur: z.string().nullable(),
});
export type ControleDocument = z.infer<typeof controleDocumentSchema>;
/* ---------- Usage 3 (démarches) : absence et réponse finale de l'agent ---------- */

/** Date `AAAA-MM-JJ` qui existe (« 2026-02-30 » est refusée). */
const dateIso = z.iso.date("date attendue au format AAAA-MM-JJ");

/**
 * Entrée de `POST /api/absence` (issue #14) : le logement et les dates, rien d'autre. Les
 * clauses (`inoccupation`, `absence`) sont lues côté serveur par
 * `get_contrat_champs(logement, ['inoccupation', 'absence'])` ; une clause envoyée par le
 * client est ignorée.
 */
export const absenceEntreeSchema = z.object({
  logement_id: z.uuid(),
  depart_le: dateIso,
  retour_le: dateIso,
});
export type AbsenceEntree = z.infer<typeof absenceEntreeSchema>;

/** Ce que `evaluerAbsence` compare : les dates, et les clauses lues sur le contrat (aucune en parcours B). */
export type AbsenceACalculer = Pick<AbsenceEntree, "depart_le" | "retour_le"> & {
  inoccupation?: GetContratSortie["inoccupation"];
  absence?: GetContratSortie["absence"];
};

export const absenceSortieSchema = z.object({
  duree_jours: z.number(),
  seuil_jours: z.number().nullable(),
  /** `null` sans contrat ou sans clause d'inoccupation retrouvée. */
  depasse_seuil: z.boolean().nullable(),
  protections: z.array(z.string()),
  clause: z.string().nullable(),
  page: z.number().nullable(),
  otv: z.object({
    ouverture_le: dateIso,
    /** Limite la plus stricte (logement qui dépend de la police : 3 jours avant le départ). */
    limite_le: dateIso,
    /** Limite si le logement dépend de la gendarmerie : la veille du départ. */
    limite_gendarmerie_le: dateIso,
    delai_ok: z.boolean(),
    trop_tot: z.boolean(),
  }),
  /** Clauses du contrat liées à l'absence, sans seuil de durée (franchise, protections…). */
  clauses_absence: getContratSortieSchema.shape.absence.unwrap(),
  /**
   * Toujours vrai (décision de Jean-Li, 18/11) : l'information de l'assureur est proposée à
   * tous. « exige » quand une clause d'inoccupation est dépassée (clause et page), sinon
   * « recommande » (pas de contrat, pas de clause, ou seuil non dépassé).
   */
  informer_assureur: z.literal(true),
  informer_assureur_niveau: z.enum(["exige", "recommande"]),
  /** Toujours vrai : l'usage 3 est proposé à tous, OTV ouverte ou non (`otv` dit quand s'inscrire). */
  preparer_usage_3: z.literal(true),
});
export type AbsenceSortie = z.infer<typeof absenceSortieSchema>;

/**
 * Réponse finale de l'usage 3. Schéma PLAT (leçon de l'usage 2) : listes en texte, une
 * ligne par élément. L'agent n'envoie rien : il rend les liens et un récapitulatif que
 * l'utilisateur relit, puis envoie lui-même après sa propre connexion.
 */
export const sortieUsage3Schema = z.object({
  otv_trouve: z.boolean().describe("Vrai si la démarche officielle d'inscription à l'OTV a été trouvée."),
  otv_url_demarche: z.string().optional().describe("Adresse de la page officielle qui permet de faire la démarche en ligne."),
  otv_connexion_requise: z.string().optional().describe("Comment l'utilisateur doit se connecter (par exemple FranceConnect), tel qu'affiché."),
  otv_informations_demandees: z.string().optional().describe("Informations et pièces que le formulaire demande, une par ligne, telles qu'affichées."),
  otv_delai: z.string().optional().describe("Délai d'inscription affiché sur la page officielle, tel quel."),
  assureur_trouve: z.boolean().describe("Vrai si le moyen de prévenir l'assureur d'une absence a été trouvé sur son site."),
  assureur_url: z.string().optional().describe("Adresse de la page de l'assureur qui explique comment le prévenir (contact, espace client)."),
  assureur_moyen: z.string().optional().describe("Moyen de prévenir l'assureur (espace client, téléphone, courrier…), tel qu'affiché."),
  recapitulatif: z.string().optional().describe("Récapitulatif à relire par l'utilisateur : dates, durée, seuil du contrat, protections à mettre en place, démarches et liens."),
  validation_demandee: z.boolean().describe("Vrai si demander_validation a été appelé avec action envoi."),
  remarque: z.string().optional().describe("Écart, doute ou raison d'un échec."),
});
export type SortieUsage3 = z.infer<typeof sortieUsage3Schema>;

/** JSON Schema à passer à H, dérivé du schéma Zod (une seule source de vérité). */
export function versJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete json.$schema;
  return json;
}

/** Type d'un schéma Zod, pour les scripts de `agents/dev/` qui n'importent pas zod eux-mêmes. */
export type SchemaZod<T> = z.ZodType<T>;

/* ---------- Enregistrement d'un run (futur format de `runs_agent`) ---------- */

/**
 * Un run de l'agent H, tel qu'écrit dans `agents/bench/runs/` par `agents/dev/boucle.ts`.
 * La table `runs_agent` existe depuis la migration 0008 ; `versLigneRunsAgent` convertit ce format en ligne.
 * Jamais d'`agent_view_url` ici : c'est un lien d'accès à la session.
 */
export const runAgentSchema = z.object({
  session_id: z.string(),
  usage: z.enum(["u1", "u2", "u3"]),
  agent: z.string(),
  agent_revision: z.number().nullable(),
  site: z.string().nullable(),
  etat_final: z.string(),
  /**
   * Une des quatre issues de la doc H, ou `null`. Une valeur inconnue renvoyée par H est
   * écrite `null` ici (la colonne `runs_agent.outcome` la refuserait) et gardée telle
   * quelle dans `observations_api.outcome_brut`.
   */
  outcome: z.enum(OUTCOMES).nullable(),
  error_code: z.string().nullable(),
  erreur: z.string().nullable(),
  motif_fin: z.enum([
    "terminee",
    "delai_apres_validation",
    "delai_global",
    "coupe_circuit",
    "interruption",
    "erreur_script",
  ]),
  annulee_par_script: z.boolean(),
  coupe_circuit: z
    .object({ motif: z.string(), source: z.string(), url: z.string() })
    .nullable(),
  debut: z.string(),
  fin: z.string(),
  duree_s: z.number(),
  nb_etapes: z.number(),
  tokens: z
    .object({
      entree: z.number(),
      cache: z.number(),
      sortie: z.number(),
      raisonnement: z.number(),
      par_modele: z.array(
        z.object({
          modele: z.string(),
          entree: z.number(),
          cache: z.number(),
          sortie: z.number(),
          raisonnement: z.number(),
        }),
      ),
    })
    .nullable(),
  cout_usd: z.number().nullable(),
  decision_validation: z.string().nullable(),
  appels_outils: z.array(
    z.object({
      outil: z.string(),
      args: z.unknown(),
      reponse: z.unknown(),
      erreur: z.string().nullable(),
      duree_s: z.number(),
    }),
  ),
  /** Réponse de l'agent telle que reçue, jamais normalisée ni corrigée. */
  sortie_finale: z.unknown(),
  /** Conforme au schéma Zod de l'usage (`null` et chaîne vide valant « absent »). */
  schema_valide: z.boolean(),
  erreurs_schema: z.array(z.string()),
  /** Ce qu'il faut aller vérifier, que le schéma soit respecté ou non. Vide si rien à signaler. */
  ecarts_metier: z.array(z.string()),
  pages_vues: z.array(z.string()),
  actions_agent: z.record(z.string(), z.number()),
  /** Ce que la doc H ne précise pas, mesuré pendant le run (onglet Retours Agent API). */
  observations_api: z.object({
    appels_sans_id: z.number(),
    attente_outils_s: z.number(),
    appels_encore_listes_apres_reponse: z.number(),
    renvois_de_resultat: z.number(),
    reponse_presente_apres_annulation: z.boolean().nullable(),
    approbations_natives_vues: z.number(),
    /** Valeur d'`outcome` renvoyée par H quand elle n'est pas une des quatre connues, sinon `null`. */
    outcome_brut: z.string().nullable().default(null),
  }),
  /** Usage 1 seulement : téléchargement du PDF et contrôle de la référence par le code. */
  controle_document: controleDocumentSchema.nullable().optional(),
});
export type RunAgent = z.infer<typeof runAgentSchema>;

export type GetMesuresEntree = z.infer<typeof getMesuresEntreeSchema>;
export type GetMesuresSortie = z.infer<typeof getMesuresSortieSchema>;
export type GetContratEntree = z.infer<typeof getContratEntreeSchema>;
export type GetContratSortie = z.infer<typeof getContratSortieSchema>;
export type DemanderValidationEntree = z.infer<typeof demanderValidationEntreeSchema>;
export type DemanderValidationSortie = z.infer<typeof demanderValidationSortieSchema>;

/* ---------- Upload (vidéo d'une pièce ou contrat) ---------- */

/** 50 Mo : limite des buckets Supabase (offre gratuite) et du service vision. */
export const TAILLE_MAX_OCTETS = 50 * 1024 * 1024;

export const uploadPreparerEntreeSchema = z.object({
  logement_id: z.uuid(),
  type: z.enum(["video", "contrat"]),
  piece: z.string().trim().min(1).max(60).optional(),
  nom_fichier: z.string().min(1).max(200),
  taille_octets: z.number().int().positive().max(TAILLE_MAX_OCTETS, "Fichier trop lourd : 50 Mo au plus."),
});
export const uploadPreparerSortieSchema = z.object({
  bucket: z.enum(["videos", "contrats"]),
  path: z.string(),
  token: z.string(),
});

export const uploadTermineEntreeSchema = z.object({
  logement_id: z.uuid(),
  type: z.enum(["video", "contrat"]),
  piece: z.string().trim().min(1).max(60).optional(),
  path: z.string().min(1),
});
export const uploadTermineSortieSchema = z.object({
  analyse_id: z.string().nullable(),
  contrat_id: z.string().nullable(),
  /** L'analyse a-t-elle été transmise au service vision (via n8n) ? */
  declenche: z.boolean(),
  message: z.string(),
});

export type UploadPreparerEntree = z.infer<typeof uploadPreparerEntreeSchema>;
export type UploadPreparerSortie = z.infer<typeof uploadPreparerSortieSchema>;
export type UploadTermineEntree = z.infer<typeof uploadTermineEntreeSchema>;
export type UploadTermineSortie = z.infer<typeof uploadTermineSortieSchema>;
