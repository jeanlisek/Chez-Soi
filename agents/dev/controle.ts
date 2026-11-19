/**
 * Contrôle de la réponse finale d'un run, commun à boucle.ts (pendant le run) et à
 * recontroler.ts (sur les runs déjà enregistrés).
 *
 * Deux questions séparées :
 *  - `schema_valide` : la réponse est-elle conforme au schéma Zod de l'usage ?
 *  - `ecarts_metier` : conforme ou pas, que faut-il aller vérifier (champ attendu absent,
 *    dimension qui dépasse la cote…) ? Liste vide si rien à signaler.
 *
 * La réponse brute de l'agent n'est jamais modifiée : on contrôle une copie normalisée.
 */
import {
  CHAMPS_ATTENDUS_USAGE_2,
  type SchemaZod,
  type SortieUsage1,
  type SortieUsage2,
} from "../../apps/web/lib/schemas";

function estVide(valeur: unknown): boolean {
  return valeur === null || (typeof valeur === "string" && valeur.trim() === "");
}

/**
 * Copie sans les propriétés vides, en profondeur. `null` et une chaîne vide (ou faite
 * seulement d'espaces) valent « absent » : H accepte `null` pour un champ optionnel que
 * l'agent ne remplit pas, et l'agent rend `""` quand on lui dit de laisser un champ vide.
 * Les tableaux sont gardés tels quels.
 */
export function sansVides(valeur: unknown): unknown {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return valeur;
  return Object.fromEntries(
    Object.entries(valeur)
      .filter(([, element]) => !estVide(element))
      .map(([cle, element]) => [cle, sansVides(element)]),
  );
}

export type Evaluation<S> = {
  /** Réponse de l'agent telle que reçue (texte JSON décodé si besoin), jamais normalisée. */
  brut: unknown;
  /** Réponse typée, normalisée, ou `null` si elle n'est pas conforme au schéma. */
  sortie: S | null;
  schema_valide: boolean;
  erreurs_schema: string[];
  ecarts_metier: string[];
};

export function evaluerSortie<S>(
  reponse: unknown,
  schema: SchemaZod<S>,
  controler?: (sortie: S) => string[],
): Evaluation<S> {
  let brut = reponse ?? null;
  if (typeof brut === "string") {
    try {
      brut = JSON.parse(brut);
    } catch {
      // Texte libre : il n'est pas conforme au schéma, et reste tel quel dans le run.
    }
  }
  if (brut === null) {
    return {
      brut,
      sortie: null,
      schema_valide: false,
      erreurs_schema: ["Aucune réponse finale."],
      ecarts_metier: [],
    };
  }

  const analyse = schema.safeParse(sansVides(brut));
  if (!analyse.success) {
    return {
      brut,
      sortie: null,
      schema_valide: false,
      erreurs_schema: analyse.error.issues.map(
        (probleme) => `${probleme.path.join(".") || "(racine)"} : ${probleme.message}`,
      ),
      ecarts_metier: [],
    };
  }
  return {
    brut,
    sortie: analyse.data,
    schema_valide: true,
    erreurs_schema: [],
    ecarts_metier: controler?.(analyse.data) ?? [],
  };
}

/* ---------- Usage 2 ---------- */

/** Mots qui disent qu'un produit se découpe (comparés sans accents ni majuscules). */
const MOTS_DECOUPE = ["decoup", "recoup", "couper", "coupe", "ciseau", "cutter", "sur mesure"];

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Règle de la skill `verifier_dimension` (issue #15), vérifiée par le code : un produit plus
 * grand que la cote n'est accepté qu'avec `citation_decoupe`, phrase de la fiche qui dit qu'il
 * se découpe. Sans citation, ou avec une citation qui ne parle pas de découpe, le produit est
 * à REFUSER. Le code ne peut pas relire la fiche : il vérifie la présence et la forme de la
 * citation, pas qu'elle figure mot pour mot sur la page (à contrôler à la main dans le replay).
 */
export function ecartDecoupe(citation: string | undefined): string | null {
  if (!citation || citation.trim().length === 0) {
    return "aucune citation_decoupe de la fiche : produit à REFUSER";
  }
  const texte = sansAccents(citation);
  if (!MOTS_DECOUPE.some((mot) => texte.includes(mot))) {
    return `citation_decoupe « ${citation} » ne dit pas que le produit se découpe : produit à REFUSER`;
  }
  if (citation.trim().split(/\s+/).length < 3) {
    return `citation_decoupe « ${citation} » trop courte pour être une phrase de la fiche : produit à REFUSER`;
  }
  return null;
}

/**
 * Écarts métier de l'usage 2, signalés et jamais corrigés : l'`outcome` de l'agent est une
 * auto-évaluation. Un produit plus grand que le tapis passe par `ecartDecoupe` (skill
 * `verifier_dimension`, issue #15).
 */
export function controlerSortieUsage2(
  sortie: SortieUsage2,
  tapis: { largeur_cm: number; longueur_cm: number } = { largeur_cm: 60, longueur_cm: 160 },
): string[] {
  if (!sortie.trouve) return [];
  const ecarts: string[] = CHAMPS_ATTENDUS_USAGE_2.filter((champ) => sortie[champ] === undefined).map(
    (champ) => `${champ} : absent ou vide alors que trouve est vrai`,
  );
  if (sortie.largeur_cm !== undefined && sortie.longueur_cm !== undefined) {
    const [petit, grand] = [sortie.largeur_cm, sortie.longueur_cm].sort((a, b) => a - b);
    const [petitTapis, grandTapis] = [tapis.largeur_cm, tapis.longueur_cm].sort((a, b) => a - b);
    if (petit > petitTapis || grand > grandTapis) {
      const decoupe = ecartDecoupe(sortie.citation_decoupe);
      if (decoupe) {
        ecarts.push(`dimensions : ${petit} × ${grand} cm dépasse ${petitTapis} × ${grandTapis} cm, ${decoupe}`);
      }
    }
  }
  return ecarts;
}

/* ---------- Usage 1 ---------- */

/** Vrai si l'hôte de l'URL est l'un des domaines officiels ou l'un de leurs sous-domaines. */
export function surDomaineOfficiel(url: string, domaines: readonly string[]): boolean {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domaines.some((domaine) => hote === domaine || hote.endsWith(`.${domaine}`));
}

/**
 * Écarts métier de l'usage 1, signalés et jamais corrigés. La référence déclarée par
 * l'agent n'est qu'un indice : le contrôle qui compte est celui du PDF par le code.
 */
export function controlerSortieUsage1(
  sortie: SortieUsage1,
  attendu: { domaines: readonly string[]; reference: string },
): string[] {
  if (!sortie.trouve) {
    return sortie.raison ? [] : ["raison : absente alors que trouve est faux"];
  }
  const ecarts: string[] = [];
  if (!sortie.url_cg) {
    ecarts.push("url_cg : absente alors que trouve est vrai");
  } else {
    if (!surDomaineOfficiel(sortie.url_cg, attendu.domaines)) {
      ecarts.push(`url_cg : ${sortie.url_cg} n'est pas sur le site de l'assureur (${attendu.domaines.join(", ")})`);
    }
    if (!/^https:\/\//i.test(sortie.url_cg)) ecarts.push("url_cg : pas en https");
  }
  if (sortie.url_fiche_information && !surDomaineOfficiel(sortie.url_fiche_information, attendu.domaines)) {
    ecarts.push(`url_fiche_information : ${sortie.url_fiche_information} n'est pas sur le site de l'assureur`);
  }
  const normaliser = (texte: string) => texte.normalize("NFKD").replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (!sortie.reference_trouvee) {
    ecarts.push("reference_trouvee : absente, la référence ne sera contrôlée que dans le PDF");
  } else if (!normaliser(sortie.reference_trouvee).includes(normaliser(attendu.reference))) {
    ecarts.push(`reference_trouvee : « ${sortie.reference_trouvee} » ne contient pas ${attendu.reference}`);
  }
  return ecarts;
}
