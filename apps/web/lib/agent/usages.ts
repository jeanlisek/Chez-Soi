import type { CheminsAutorises } from "../../../../agents/dev/boucle";
import { controlerSortieUsage2, evaluerSortie, type Evaluation } from "../../../../agents/dev/controle";
import { sortieUsage2Schema, versJsonSchema } from "@/lib/schemas";

/**
 * Ce que l'application sait de chaque usage de l'agent H. Les règles permanentes (aucune
 * connexion, panier comme dernière page, validation…) et la déclaration des custom tools
 * vivent dans l'agent maison créé sur H (`agents/definitions/`, figé sur `nom:N`) : la session
 * ne porte que la tâche, le format de réponse et la page de départ.
 *
 * Usages 1 et 3 : leurs schémas de sortie et leurs contrôles arrivent avec les PR #17 et #21.
 * Ils s'ajoutent ici dès leur fusion (même forme que l'usage 2).
 */
export type ContexteTache = { faille_id?: string; logement_id: string; site?: string };

export type DefinitionUsage = {
  usage: 1 | 2 | 3;
  /** Agent maison sur H, révision figée. */
  agent: string;
  site: string;
  urlDepart: string;
  formatReponse: Record<string, unknown>;
  consigne: (contexte: ContexteTache) => string;
  /** `cote` : dimensions de la faille du run, pour comparer le produit (usage 2). */
  evaluer: (reponse: unknown, cote?: { largeur_cm: number; longueur_cm: number }) => Evaluation<unknown>;
  /** Mots d'URL qui déclenchent le coupe-circuit, en plus des motifs par défaut. */
  motifsEnPlus?: string[];
  /** Liste blanche des pages pour la démo : toute autre page déclenche le coupe-circuit. */
  cheminsAutorises?: CheminsAutorises;
};

const usage2: DefinitionUsage = {
  usage: 2,
  agent: "chez-soi-acheteur:2",
  site: "www.ikea.com/fr/fr",
  urlDepart: "https://www.ikea.com/fr/fr",
  formatReponse: versJsonSchema(sortieUsage2Schema),
  // IKEA France : accueil, recherche, catégories, fiche produit et panier. Rien d'autre.
  cheminsAutorises: [
    { hote: "ikea.com", exacts: ["/fr/fr"], prefixes: ["/fr/fr/search", "/fr/fr/cat/", "/fr/fr/p/", "/fr/fr/shoppingcart"] },
  ],
  consigne: ({ faille_id, site }) =>
    [
      `Trouve sur le site ${site ?? "www.ikea.com/fr/fr"} un équipement compatible avec la faille ${faille_id} du logement, mets-le au panier, puis arrête-toi et demande la validation.`,
      `Appelle d'abord get_mesures avec faille_id = "${faille_id}" pour connaître les cotes et les contraintes de l'occupant.`,
      "Applique tes règles permanentes : vérification de la dimension sur la fiche, panier comme dernière page, demander_validation avec action « panier », puis plus aucune action et la réponse finale au format demandé.",
    ].join("\n"),
  evaluer: (reponse, cote) =>
    evaluerSortie(reponse, sortieUsage2Schema, (sortie) => controlerSortieUsage2(sortie, cote)) as Evaluation<unknown>,
};

export const USAGES: Partial<Record<1 | 2 | 3, DefinitionUsage>> = { 2: usage2 };

export function definitionUsage(usage: number): DefinitionUsage | null {
  return USAGES[usage as 1 | 2 | 3] ?? null;
}
