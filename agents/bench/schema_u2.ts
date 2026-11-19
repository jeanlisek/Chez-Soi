/**
 * Format expérimental du banc local U2, avec lire_fiche_produit.
 * L'application conserve sortieUsage2Schema et ses deux outils ; aucun import
 * de ce module dans apps/web. Les dépendances du lanceur sont installées dans apps/web.
 */
import { z } from "../../apps/web/node_modules/zod";
import { sortieUsage2Schema } from "../../apps/web/lib/schemas";

export const sortieUsage2BancSchema = sortieUsage2Schema.extend({
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
export type SortieUsage2Banc = z.infer<typeof sortieUsage2BancSchema>;
