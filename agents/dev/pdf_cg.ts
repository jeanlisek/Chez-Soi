/**
 * Usage 1 (issue #7) : téléchargement du PDF des conditions générales à l'URL renvoyée par
 * l'agent, puis contrôle de la référence PAR LE CODE (on ne se fie ni à l'`outcome` ni à
 * `reference_trouvee`).
 *
 * Extraction du texte sans dépendance : on décompresse les flux FlateDecode avec zlib et on
 * relit les chaînes littérales des opérateurs de texte. Ça marche pour la plupart des PDF
 * bureautiques, pas pour ceux dont les polices sont encodées (texte en glyphes hexadécimaux).
 * Dans ce cas le résultat est `non_verifiable`, jamais `absente` : le contrôle sera refait
 * par Docling (service vision `/contrat`) ou à la main.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import type { ControleDocument } from "../../apps/web/lib/schemas";
import { surDomaineOfficiel } from "./controle";

const TAILLE_MAX_OCTETS = 30 * 1024 * 1024;
const DELAI_MS = 30_000;

/** Lettres et chiffres seulement, en majuscules : « M2442 - 01/2023 » → « M2442012023 ». */
export function normaliser(texte: string): string {
  return texte.normalize("NFKD").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** Décode une chaîne littérale PDF « ( … ) » : échappements simples et octaux. */
function decoderLitterale(brut: string): string {
  return brut.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, seq: string) => {
    if (/^[0-7]+$/.test(seq)) return String.fromCharCode(parseInt(seq, 8));
    const table: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    return table[seq] ?? "";
  });
}

/** Textes candidats du PDF : le fichier brut et chaque flux décompressé, avec leurs chaînes littérales. */
export function textesDuPdf(pdf: Buffer): { textes: string[]; litterales: number } {
  const textes = [pdf.toString("latin1")];
  const flux = /stream\r?\n/g;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = flux.exec(textes[0])) !== null) {
    const debut = correspondance.index + correspondance[0].length;
    const fin = textes[0].indexOf("endstream", debut);
    if (fin === -1) break;
    try {
      textes.push(inflateSync(pdf.subarray(debut, fin)).toString("latin1"));
    } catch {
      // Flux non compressé, ou compressé autrement (image, police) : ignoré.
    }
    flux.lastIndex = fin;
  }
  let litterales = 0;
  const avecLitterales = textes.map((texte) => {
    const morceaux = texte.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
    litterales += morceaux.length;
    return morceaux.map((morceau: string) => decoderLitterale(morceau.slice(1, -1))).join("");
  });
  return { textes: [...textes, ...avecLitterales], litterales };
}

export function chercherReference(pdf: Buffer, reference: string): "trouvee" | "absente" | "non_verifiable" {
  const cible = normaliser(reference);
  const { textes, litterales } = textesDuPdf(pdf);
  if (textes.some((texte) => normaliser(texte).includes(cible))) return "trouvee";
  // Trop peu de texte lisible : on ne peut pas conclure que la référence est absente.
  return litterales < 200 ? "non_verifiable" : "absente";
}

/**
 * Télécharge le document et contrôle la référence. Lecture seule : un GET public, sans
 * cookie ni identifiant. Le PDF est rangé par `enregistrer` (serveur : bucket privé
 * `contrats`) ou, à défaut, dans `dossierPdf` (scripts locaux, dossier ignoré par git).
 */
export async function controlerDocument(options: {
  url: string;
  domaines: readonly string[];
  referenceAttendue: string;
  dossierPdf?: string;
  prefixe: string;
  /** Range le PDF vérifié et renvoie son chemin (`fichier_local`). */
  enregistrer?: (pdf: Buffer, sha256: string) => Promise<string | null>;
}): Promise<ControleDocument> {
  const resultat: ControleDocument = {
    url: options.url,
    url_finale: null,
    domaine_officiel: surDomaineOfficiel(options.url, options.domaines),
    telecharge: false,
    est_pdf: false,
    octets: null,
    sha256: null,
    reference: null,
    reference_attendue: options.referenceAttendue,
    fichier_local: null,
    erreur: null,
  };
  // On ne télécharge rien hors du site de l'assureur.
  if (!resultat.domaine_officiel) {
    resultat.erreur = "URL hors du site de l'assureur : téléchargement refusé.";
    return resultat;
  }
  try {
    const reponse = await fetch(options.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(DELAI_MS),
      headers: { Accept: "application/pdf,*/*;q=0.5" },
    });
    resultat.url_finale = reponse.url;
    if (!surDomaineOfficiel(reponse.url, options.domaines)) {
      resultat.domaine_officiel = false;
      resultat.erreur = `Redirigé hors du site de l'assureur : ${reponse.url}`;
      return resultat;
    }
    if (!reponse.ok) {
      resultat.erreur = `HTTP ${reponse.status}`;
      return resultat;
    }
    const longueur = Number(reponse.headers.get("content-length") ?? 0);
    if (longueur > TAILLE_MAX_OCTETS) {
      resultat.erreur = `Document trop lourd (${longueur} octets).`;
      return resultat;
    }
    const pdf = Buffer.from(await reponse.arrayBuffer());
    resultat.telecharge = true;
    resultat.octets = pdf.length;
    resultat.est_pdf = pdf.subarray(0, 1024).toString("latin1").includes("%PDF-");
    if (!resultat.est_pdf) {
      resultat.erreur = `Ce n'est pas un PDF (type annoncé : ${reponse.headers.get("content-type") ?? "inconnu"}). L'agent a peut-être renvoyé une page HTML.`;
      return resultat;
    }
    resultat.sha256 = createHash("sha256").update(pdf).digest("hex");
    resultat.reference = chercherReference(pdf, options.referenceAttendue);
    if (options.enregistrer) {
      resultat.fichier_local = await options.enregistrer(pdf, resultat.sha256);
    } else if (options.dossierPdf) {
      await mkdir(options.dossierPdf, { recursive: true });
      const fichier = path.join(options.dossierPdf, `${options.prefixe}_${resultat.sha256.slice(0, 12)}.pdf`);
      await writeFile(fichier, pdf);
      resultat.fichier_local = path.relative(path.resolve(options.dossierPdf, "../../.."), fichier);
    }
  } catch (erreur) {
    resultat.erreur = erreur instanceof Error ? erreur.message : String(erreur);
  }
  return resultat;
}
