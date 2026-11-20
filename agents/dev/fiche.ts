/**
 * Vérifie par le code qu'une citation de l'agent figure sur la fiche produit (issue #15).
 * La skill `verifier-dimension` exige une phrase recopiée mot pour mot ; au run du 18/11
 * (chez-soi-acheteur:2 de l'organisation H personnelle d'Aurélie), l'agent a rendu la bonne phrase avec « tissus » au lieu de
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
    const autoriser = (valeur: string) => {
      const u = new URL(valeur);
      if (u.protocol !== "https:" || u.username || u.password ||
          !["www.ikea.com", "ikea.com", "www.decoweb.com", "decoweb.com"].includes(u.hostname) ||
          (u.port && u.port !== "443")) throw new Error("Fiche hors des marchands HTTPS autorisés du banc");
      return u.href;
    };
    let destination = autoriser(url);
    let reponse!: Response;
    for (let i = 0; i < 5; i++) {
      reponse = await fetch(destination, { redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (ChezSoi controle)", "Accept-Language": "fr-FR,fr;q=0.9" },
        signal: AbortSignal.timeout(20_000),
      });
      if (![301,302,303,307,308].includes(reponse.status)) break;
      const lieu = reponse.headers.get("location");
      if (!lieu) throw new Error("Redirection sans destination");
      destination = autoriser(new URL(lieu, destination).href);
    }
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

/* ---------- Nom du produit (run 40 du 19/11 : « pour tissus » au lieu de « pour tapis ») ---------- */

/** Fiche produit IKEA France ou Castorama en https, comme la liste blanche de l'usage 2. Rien d'autre n'est relu. */
export function estFicheAutorisee(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "www.ikea.com" || u.hostname === "ikea.com") return u.pathname.startsWith("/fr/fr/p/");
    if (u.hostname === "www.castorama.fr" || u.hostname === "castorama.fr") return /_cafr\.prd$/i.test(u.pathname);
    return false;
  } catch {
    return false;
  }
}

/** Nom du produit tel que la fiche l'affiche : `og:title` (ou `<title>`), sans « - IKEA ». */
export function nomDepuisHtml(html: string): string | null {
  const brut =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<title>([^<]+)<\/title>/i.exec(html)?.[1];
  if (!brut) return null;
  const nom = texteDeLaPage(brut).replace(/\s*-\s*IKEA\s*$/i, "").replace(/\s*\|\s*Castorama\s*$/i, "").replace(/\s+/g, " ").trim();
  return nom || null;
}

/** Nom lu sur la fiche, ou `null` si elle est hors liste blanche ou illisible (on garde alors celui de l'agent). */
export async function lireNomSurFiche(url: string): Promise<string | null> {
  if (!estFicheAutorisee(url)) return null;
  try {
    const reponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (ChezSoi controle)", "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!reponse.ok || !estFicheAutorisee(reponse.url || url)) return null;
    return nomDepuisHtml(await reponse.text());
  } catch {
    return null;
  }
}

/** Écart métier si le nom rendu par l'agent n'est pas celui de la fiche (casse, accents et ponctuation ignorés). */
export function ecartNom(nomAgent: string | undefined, nomFiche: string | null): string | null {
  if (!nomAgent || !nomFiche) return null;
  return mots(nomAgent).join(" ") === mots(nomFiche).join(" ")
    ? null
    : `produit : « ${nomAgent} » n'est pas le nom de la fiche « ${nomFiche} »`;
}

/* ---------- Contrôle v2 (19/11 au soir) : la preuve est lue sur la fiche par le code ---------- */

/**
 * Règle stricte v1 (PR #32) : l'agent devait recopier mot pour mot la phrase de découpe ; une
 * faute de recopie (« tissus » pour « tapis ») faisait refuser un bon produit. En v2, le code lit
 * la fiche lui-même et cherche les preuves dans le texte affiché : une phrase qui dit que le
 * produit se découpe, et les dimensions annoncées. La citation de l'agent n'est plus qu'un indice.
 * Un produit sans phrase de découpe sur sa fiche reste refusé, comme en v1.
 */
export type PreuvesFiche = {
  version: "v2";
  url: string;
  /** Phrase de la fiche qui autorise la découpe, recopiée par le code depuis la page. */
  phrase_decoupe: string | null;
  /** Vrai si la paire de dimensions annoncée (« 67,5x200 cm ») figure sur la fiche. */
  dimensions_sur_fiche: boolean;
  nom_fiche: string | null;
  erreur: string | null;
};

const MOTS_DECOUPE_FICHE = /(d[ée]coup|recoup|couper|ciseau|cutter)/i;
const NEGATION = /\b(ne|n'|pas|impossible|interdit|non)\b/i;

/** Première phrase de la page qui dit que le produit se découpe, sans négation. */
export function phraseDecoupe(texte: string): string | null {
  // Découpe d'abord sur les blocs de la page (balises remplacées par des espaces), puis sur les phrases.
  const phrases = texte
    .split(/\s{2,}|\n|(?<=[.!?])\s+|\s[•·]\s/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 12 && p.length <= 400);
  return phrases.find((p) => MOTS_DECOUPE_FICHE.test(p) && !NEGATION.test(p)) ?? null;
}

/** Vrai si la page affiche les deux dimensions ensemble (« 67,5x200 cm », « 67.5 × 200 cm »), dans un sens ou l'autre. */
export function dimensionsSurFiche(texte: string, largeur: number, longueur: number): boolean {
  const t = texte.replace(/,/g, ".");
  const egal = (a: number, b: number) => Math.abs(a - b) < 0.05;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm/gi)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if ((egal(a, largeur) && egal(b, longueur)) || (egal(a, longueur) && egal(b, largeur))) return true;
  }
  // Fiche qui donne les côtés séparément (« Largeur : 67,5 cm », « Longueur : 200 cm »).
  const valeurs = [...t.matchAll(/(\d+(?:\.\d+)?)\s*cm\b/gi)].map((m) => Number(m[1]));
  return valeurs.some((v) => egal(v, largeur)) && valeurs.some((v) => egal(v, longueur));
}

/** Lit la fiche (IKEA France, liste blanche de l'usage 2) et en extrait les preuves. */
export async function preuvesSurFiche(url: string, dims?: { largeur_cm?: number; longueur_cm?: number }): Promise<PreuvesFiche> {
  const vide: PreuvesFiche = { version: "v2", url, phrase_decoupe: null, dimensions_sur_fiche: false, nom_fiche: null, erreur: null };
  if (!estFicheAutorisee(url)) return { ...vide, erreur: "fiche hors liste blanche" };
  try {
    const reponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (ChezSoi controle)", "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!reponse.ok || !estFicheAutorisee(reponse.url || url)) return { ...vide, erreur: `HTTP ${reponse.status}` };
    const html = await reponse.text();
    return preuvesDepuisHtml(url, html, dims);
  } catch (erreur) {
    return { ...vide, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

/** Partie pure de `preuvesSurFiche` : testable et rejouable sur une page enregistrée. */
export function preuvesDepuisHtml(url: string, html: string, dims?: { largeur_cm?: number; longueur_cm?: number }): PreuvesFiche {
  const texte = texteDeLaPage(html);
  return {
    version: "v2",
    url,
    phrase_decoupe: phraseDecoupe(texte),
    dimensions_sur_fiche:
      dims?.largeur_cm !== undefined && dims?.longueur_cm !== undefined ? dimensionsSurFiche(texte, dims.largeur_cm, dims.longueur_cm) : false,
    nom_fiche: nomDepuisHtml(html),
    erreur: null,
  };
}
