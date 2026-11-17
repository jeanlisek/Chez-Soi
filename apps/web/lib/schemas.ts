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
