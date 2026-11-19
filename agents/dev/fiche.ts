/**
 * Vérifie par le code qu'une citation de l'agent figure sur la fiche produit (issue #15).
 * La skill `verifier-dimension` exige une phrase recopiée mot pour mot ; au run du 18/11
 * (chez-soi-acheteur:2), l'agent a rendu la bonne phrase avec « tissus » au lieu de
 * « tapis », comme aux deux runs précédents pour le nom du produit : on ne croit pas la
 * citation, on la cherche sur la page publique (simple GET, sans session H).
 */

export type VerificationCitation = {
  url: string;
  /** `exacte` : trouvée telle quelle ; `approchee` : trouvée à `mots_differents` mots près ; `absente` ; `non_verifiable` : page illisible. */
  statut: "exacte" | "approchee" | "absente" | "non_verifiable";
  mots_differents: number | null;
  /** Mots de la citation remplacés par ceux de la page, par exemple « tissus → tapis ». */
  differences: string[];
  extrait_page: string | null;
  erreur: string | null;
};

function mots(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function texteDeLaPage(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Cherche la citation dans le texte de la page, mot à mot, sur une fenêtre glissante de la
 * même longueur. Tolérance : 1 mot différent par tranche de 10 (au moins 1). Au-delà, absente.
 * Le JSON embarqué dans les scripts est retiré : seul le texte affiché compte.
 */
export function chercherCitation(citation: string, texteBrut: string): Omit<VerificationCitation, "url" | "erreur"> {
  const cible = mots(citation);
  const page = mots(texteBrut);
  if (cible.length === 0 || page.length < cible.length) {
    return { statut: "absente", mots_differents: null, differences: [], extrait_page: null };
  }
  let meilleur = { ecarts: Infinity, debut: 0 };
  for (let debut = 0; debut + cible.length <= page.length; debut += 1) {
    if (page[debut] !== cible[0] && page[debut + 1] !== cible[1]) continue;
    let ecarts = 0;
    for (let i = 0; i < cible.length && ecarts < meilleur.ecarts; i += 1) {
      if (page[debut + i] !== cible[i]) ecarts += 1;
    }
    if (ecarts < meilleur.ecarts) meilleur = { ecarts, debut };
    if (ecarts === 0) break;
  }
  const tolerance = Math.max(1, Math.floor(cible.length / 10));
  if (meilleur.ecarts > tolerance) {
    return { statut: "absente", mots_differents: null, differences: [], extrait_page: null };
  }
  const fenetre = page.slice(meilleur.debut, meilleur.debut + cible.length);
  const differences = cible.flatMap((mot, i) => (mot === fenetre[i] ? [] : [`${mot} → ${fenetre[i]}`]));
  return {
    statut: meilleur.ecarts === 0 ? "exacte" : "approchee",
    mots_differents: meilleur.ecarts,
    differences,
    extrait_page: fenetre.join(" "),
  };
}

export async function verifierCitationSurFiche(url: string, citation: string): Promise<VerificationCitation> {
  try {
    const reponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (ChezSoi controle)", "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!reponse.ok) {
      return { url, statut: "non_verifiable", mots_differents: null, differences: [], extrait_page: null, erreur: `HTTP ${reponse.status}` };
    }
    return { url, ...chercherCitation(citation, texteDeLaPage(await reponse.text())), erreur: null };
  } catch (erreur) {
    return {
      url,
      statut: "non_verifiable",
      mots_differents: null,
      differences: [],
      extrait_page: null,
      erreur: erreur instanceof Error ? erreur.message : String(erreur),
    };
  }
}

/**
 * Pour une sortie de l'usage 2 : si l'agent donne une `citation_decoupe` et un `lien`, la
 * cherche sur la fiche et renvoie l'écart métier à ajouter (ou rien). Utilisé après le run
 * (run_u2.ts) et par recontroler.ts, pour que `--ecrire` garde ce contrôle.
 */
export async function ecartsCitationFiche(sortie: { citation_decoupe?: string; lien?: string } | null): Promise<string[]> {
  if (!sortie?.citation_decoupe || !sortie.lien) return [];
  const ecart = ecartCitation(await verifierCitationSurFiche(sortie.lien, sortie.citation_decoupe));
  return ecart ? [ecart] : [];
}

/**
 * Écart métier à ajouter au run, ou `null` si la citation est sur la page mot pour mot.
 * Règle stricte (Bastian, PR #32) : seule une citation exacte prouve la découpe. Une citation
 * approchée ou une fiche illisible ne vaut pas preuve : produit à REFUSER.
 */
export function ecartCitation(verification: VerificationCitation): string | null {
  switch (verification.statut) {
    case "exacte":
      return null;
    case "approchee":
      return `citation_decoupe retrouvée sur la fiche à ${verification.mots_differents} mot(s) près (${verification.differences.join(", ")})  : pas une citation littérale, produit à REFUSER`;
    case "absente":
      return "citation_decoupe introuvable sur la fiche : produit à REFUSER";
    default:
      return `citation_decoupe non vérifiable sur la fiche (${verification.erreur ?? "page illisible"}) : aucune preuve de découpe, produit à REFUSER`;
  }
}
