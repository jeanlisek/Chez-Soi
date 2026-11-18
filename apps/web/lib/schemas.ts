import { z } from "zod";

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
