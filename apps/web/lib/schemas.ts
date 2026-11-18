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
  hauteur_cm: z.number(),
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
      clause: z.string(),
      page: z.number(),
    })
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
  trouve: z.boolean().describe("Vrai si un produit compatible avec les cotes a été trouvé."),
  au_panier: z.boolean().describe("Vrai si le produit a été ajouté au panier."),
  produit: z.string().optional().describe("Nom exact du produit."),
  prix_eur: z.number().optional().describe("Prix TTC en euros, hors livraison."),
  largeur_cm: z.number().optional().describe("Largeur du produit lue sur la fiche, en centimètres."),
  longueur_cm: z.number().optional().describe("Longueur du produit lue sur la fiche, en centimètres."),
  lien: z.string().optional().describe("URL de la fiche produit."),
  delai_livraison: z.string().optional().describe("Délai de livraison affiché, tel quel."),
  remarque: z.string().optional().describe("Écart, doute ou raison de l'échec."),
});
export type SortieUsage2 = z.infer<typeof sortieUsage2Schema>;

/** Champs attendus quand `trouve` est vrai : leur absence est signalée, pas corrigée. */
export const CHAMPS_ATTENDUS_USAGE_2 = [
  "produit",
  "prix_eur",
  "largeur_cm",
  "longueur_cm",
  "lien",
  "delai_livraison",
] as const satisfies readonly (keyof SortieUsage2)[];

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
 * La table `runs_agent` n'existe pas encore (point ouvert 4) : ce schéma en est l'ébauche.
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
