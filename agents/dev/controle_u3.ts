/**
 * Contrôle de la réponse finale de l'usage 3 (issue #14). Fichier séparé de `controle.ts`
 * pour ne pas entrer en conflit avec les branches de l'usage 1 et de la skill, qui le
 * modifient aussi. Même principe : écarts signalés, jamais corrigés.
 */
import type { SortieUsage3 } from "../../apps/web/lib/schemas";

export type AttenduUsage3 = {
  domainesOtv: readonly string[];
  domainesAssureur: readonly string[];
  depart_le: string;
  retour_le: string;
  duree_jours: number;
  seuil_jours: number | null;
};

function minusculesSansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Vrai si l'hôte de l'URL est l'un des domaines ou l'un de leurs sous-domaines. */
function surDomaine(url: string, domaines: readonly string[]): boolean {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domaines.some((domaine) => hote === domaine || hote.endsWith(`.${domaine}`));
}

const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

/** Formes d'une date AAAA-MM-JJ qu'un récapitulatif peut employer (texte déjà sans accents). */
function formesDate(iso: string): string[] {
  const [annee, mois, jour] = iso.split("-");
  const nomMois = MOIS[Number(mois) - 1];
  const j = String(Number(jour));
  return [iso, `${jour}/${mois}/${annee}`, `${jour}/${mois}`, `${j} ${nomMois}`, `${j}er ${nomMois}`];
}

/**
 * L'agent ne doit rien envoyer : liens sur les sites officiels, arrêt demandé avant envoi,
 * récapitulatif qui reprend les dates, la durée et le seuil, sans donnée personnelle (l'agent
 * n'en a aucune : une adresse e-mail dans le récapitulatif serait inventée).
 */
export function controlerSortieUsage3(sortie: SortieUsage3, attendu: AttenduUsage3): string[] {
  const ecarts: string[] = [];
  const lien = (champ: string, url: string | undefined, domaines: readonly string[]) => {
    if (!url) {
      ecarts.push(`${champ} : absent alors que la démarche est dite trouvée`);
      return;
    }
    if (!surDomaine(url, domaines)) ecarts.push(`${champ} : ${url} n'est pas sur ${domaines.join(", ")}`);
    if (!/^https:\/\//i.test(url)) ecarts.push(`${champ} : pas en https`);
  };

  if (sortie.otv_trouve) lien("otv_url_demarche", sortie.otv_url_demarche, attendu.domainesOtv);
  else if (!sortie.remarque) ecarts.push("otv_trouve : faux sans raison dans remarque");
  if (sortie.assureur_trouve) lien("assureur_url", sortie.assureur_url, attendu.domainesAssureur);
  else if (!sortie.remarque) ecarts.push("assureur_trouve : faux sans raison dans remarque");

  if (!sortie.validation_demandee) {
    ecarts.push("validation_demandee : faux, l'arrêt avant envoi n'a pas été demandé");
  }

  const recap = sortie.recapitulatif;
  if (!recap) {
    ecarts.push("recapitulatif : absent");
    return ecarts;
  }
  const texte = minusculesSansAccents(recap);
  const dates = [
    ["départ", attendu.depart_le],
    ["retour", attendu.retour_le],
  ] as const;
  for (const [quoi, iso] of dates) {
    if (!formesDate(iso).some((forme) => texte.includes(forme))) {
      ecarts.push(`recapitulatif : date de ${quoi} (${iso}) absente`);
    }
  }
  if (!texte.includes(String(attendu.duree_jours))) {
    ecarts.push(`recapitulatif : durée (${attendu.duree_jours} jours) absente`);
  }
  if (attendu.seuil_jours !== null && !texte.includes(String(attendu.seuil_jours))) {
    ecarts.push(`recapitulatif : seuil d'inoccupation (${attendu.seuil_jours} jours) absent`);
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(recap)) {
    ecarts.push("recapitulatif : contient une adresse e-mail (l'agent n'en a aucune : inventée ?)");
  }
  // Un numéro déjà donné dans `assureur_moyen` (relevé sur le site de l'assureur) est admis ;
  // tout autre numéro est signalé.
  const chiffres = (texte: string) => texte.replace(/\D/g, "");
  const numerosAssureur = new Set(
    [...(sortie.assureur_moyen ?? "").matchAll(/(?:\+33\s?|\b0)[1-9](?:[ .-]?\d{2}){4}\b/g)].map((m) => chiffres(m[0])),
  );
  const autresNumeros = [...recap.matchAll(/(?:\+33\s?|\b0)[1-9](?:[ .-]?\d{2}){4}\b/g)]
    .map((m) => m[0])
    .filter((numero) => !numerosAssureur.has(chiffres(numero)));
  if (autresNumeros.length) {
    ecarts.push(`recapitulatif : numéro(s) de téléphone hors de assureur_moyen (${autresNumeros.join(", ")}) : à vérifier, aucun numéro personnel`);
  }
  return ecarts;
}
