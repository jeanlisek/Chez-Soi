import type { AbsenceEntree, AbsenceSortie } from "./schemas";

/**
 * Fenêtre d'inscription à l'Opération tranquillité vacances, d'après service-public.gouv.fr
 * (démarche R41033, lue le 18/11) : de 45 jours avant le départ jusqu'à la veille.
 * Les délais locaux varient (certaines communes demandent plusieurs jours) : à vérifier et
 * à dater dans le Registre des sources avant d'en faire une règle du seed.
 */
export const OTV_OUVERTURE_JOURS_AVANT = 45;
export const OTV_LIMITE_JOURS_AVANT = 1;

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
  const limite = depart - OTV_LIMITE_JOURS_AVANT;
  const delaiOtvOk = maintenant >= ouverture && maintenant <= limite;

  return {
    duree_jours: duree,
    seuil_jours: inoccupation?.duree_max_jours ?? null,
    depasse_seuil: depasseSeuil,
    protections: inoccupation?.protections ?? [],
    clause: inoccupation?.clause ?? null,
    page: inoccupation?.page ?? null,
    otv: {
      ouverture_le: versDate(ouverture),
      limite_le: versDate(limite),
      delai_ok: delaiOtvOk,
      trop_tot: maintenant < ouverture,
    },
    informer_assureur: depasseSeuil === true,
    preparer_usage_3: depasseSeuil === true || delaiOtvOk,
  };
}
