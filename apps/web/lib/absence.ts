import type { AbsenceEntree, AbsenceSortie } from "./schemas";

/**
 * Fenêtre d'inscription à l'Opération tranquillité vacances, d'après service-public.gouv.fr
 * (fiche F34634, lue le 18/11, et confirmée par le run réel de l'usage 3) : 45 jours à
 * l'avance au plus tôt ; au plus tard 3 jours avant le départ si le logement dépend de la
 * police, la veille s'il dépend de la gendarmerie. Sans savoir de qui dépend le logement,
 * on retient la limite la plus stricte (police). À dater dans le Registre des sources.
 */
export const OTV_OUVERTURE_JOURS_AVANT = 45;
export const OTV_LIMITE_POLICE_JOURS_AVANT = 3;
export const OTV_LIMITE_GENDARMERIE_JOURS_AVANT = 1;

const JOUR_MS = 86_400_000;

/** Date `AAAA-MM-JJ` → nombre de jours depuis l'époque (UTC, sans heure ni fuseau). */
function jours(date: string): number {
  const [annee, mois, jour] = date.split("-").map(Number);
  return Date.UTC(annee, mois - 1, jour) / JOUR_MS;
}

function versDate(nombreDeJours: number): string {
  return new Date(nombreDeJours * JOUR_MS).toISOString().slice(0, 10);
}

/**
 * Compare une absence au seuil d'inoccupation du contrat et à la fenêtre OTV. Calcul pur,
 * sans base ni réseau : `/api/absence` l'appelle, et l'usage 3 n'est préparé que si l'un
 * des deux est utile.
 *
 * - Durée = nombre de nuits (retour − départ). Jeanne : 15/12 → 19/01 = 35 jours.
 * - `depasse_seuil` : vrai si la durée dépasse strictement `duree_max_jours`. `null` sans
 *   contrat (parcours B) ou sans clause d'inoccupation retrouvée.
 * - `delai_otv_ok` : vrai si aujourd'hui est dans la fenêtre d'inscription.
 */
export function evaluerAbsence(entree: AbsenceEntree, aujourdhui: string): AbsenceSortie {
  const depart = jours(entree.depart_le);
  const retour = jours(entree.retour_le);
  if (retour < depart) throw new Error("retour_le est avant depart_le.");
  const duree = retour - depart;
  const maintenant = jours(aujourdhui);

  const inoccupation = entree.inoccupation ?? null;
  const depasseSeuil = inoccupation ? duree > inoccupation.duree_max_jours : null;

  const ouverture = depart - OTV_OUVERTURE_JOURS_AVANT;
  const limitePolice = depart - OTV_LIMITE_POLICE_JOURS_AVANT;
  const limiteGendarmerie = depart - OTV_LIMITE_GENDARMERIE_JOURS_AVANT;
  // Limite la plus stricte tant qu'on ne sait pas si le logement dépend de la police.
  const delaiOtvOk = maintenant >= ouverture && maintenant <= limitePolice;

  return {
    duree_jours: duree,
    seuil_jours: inoccupation?.duree_max_jours ?? null,
    depasse_seuil: depasseSeuil,
    protections: inoccupation?.protections ?? [],
    clause: inoccupation?.clause ?? null,
    page: inoccupation?.page ?? null,
    otv: {
      ouverture_le: versDate(ouverture),
      limite_le: versDate(limitePolice),
      limite_gendarmerie_le: versDate(limiteGendarmerie),
      delai_ok: delaiOtvOk,
      trop_tot: maintenant < ouverture,
    },
    informer_assureur: depasseSeuil === true,
    preparer_usage_3: depasseSeuil === true || delaiOtvOk,
  };
}
