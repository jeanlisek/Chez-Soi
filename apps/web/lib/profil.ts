/**
 * Référentiel du profil (maquette finale de Hoang-Kim) : échelles lues selon l'âge et points de vigilance.
 * Des capacités et des habitudes, jamais des maladies (RGPD art. 9).
 */
export type Tranche = "bebe" | "enfant" | "ado" | "adulte" | "senior";
export const TRANCHE_LABEL: Record<Tranche, string> = { bebe: "Tout-petit", enfant: "Enfant", ado: "Ado", adulte: "Adulte", senior: "Senior" };

/** Âge en années révolues à partir d'une date AAAA-MM-JJ ; undefined si la date manque. */
export function ageDe(naissance: string | null | undefined, ref = new Date()): number | undefined {
  if (!naissance) return undefined;
  const d = new Date(naissance);
  if (Number.isNaN(d.getTime())) return undefined;
  let a = ref.getFullYear() - d.getFullYear();
  if (ref.getMonth() < d.getMonth() || (ref.getMonth() === d.getMonth() && ref.getDate() < d.getDate())) a--;
  return Math.max(0, a);
}
export const trancheDe = (age?: number): Tranche =>
  age === undefined ? "adulte" : age < 3 ? "bebe" : age < 12 ? "enfant" : age < 18 ? "ado" : age < 65 ? "adulte" : "senior";

const DEPLACEMENT = ["Sans difficulté", "Lentement", "Avec une canne", "Avec un déambulateur", "En fauteuil"];
/** Même échelle 0 à 4, lue selon l'âge. */
export const ECHELLE_DEPLACEMENT: Record<Tranche, string[]> = {
  bebe: ["Porté dans les bras", "À quatre pattes", "Premiers pas", "Marche bien", "Court partout"],
  enfant: ["Sans difficulté", "Fatigue vite", "Avec une aide (attelle, cannes)", "Avec un déambulateur", "En fauteuil ou porté"],
  ado: ["Sans difficulté", "Fatigue vite", "Avec une aide (attelle, cannes)", "Avec un déambulateur", "En fauteuil"],
  adulte: DEPLACEMENT,
  senior: DEPLACEMENT,
};

export const VUE = ["Bonne vue", "Myope ou presbyte (lunettes)", "Vue réduite même avec lunettes", "Malvoyant ou aveugle"];
export const AUDITION = ["Bonne audition", "Porte un appareil auditif", "Entend mal sans appareil", "Sourd ou malentendant"];
/** À partir de ce niveau, la base retient « vue réduite » / « audition réduite » (les règles lisent ces booléens). */
export const SEUIL_REDUIT = 2;

/** Ce qui revient le plus souvent selon l'âge. */
export function vigilance(t: Tranche, age?: number): { aide: string; options: { id: string; label: string }[] } {
  switch (t) {
    case "bebe":
      return { aide: "Il explore à quatre pattes : on sécurise ce qui est à sa hauteur.", options: [{ id: "bouche", label: "Met tout à la bouche" }, { id: "agrippe", label: "S'agrippe aux meubles" }, { id: "placards-bas", label: "Ouvre les placards bas" }] };
    case "enfant":
      return { aide: "Ce qu'il fait seul : on sécurise ce qu'il peut atteindre.", options: [{ id: "grimpe", label: "Grimpe partout" }, { id: "ouvre", label: "Ouvre portes et fenêtres" }, { id: "seul", label: "Joue seul dans sa chambre" }, ...((age ?? 0) < 7 ? [{ id: "lire", label: "Ne lit pas encore" }] : [])] };
    case "ado":
      return { aide: "Ce qu'il fait sans adulte : on vérifie la cuisine et les accès.", options: [{ id: "seul-maison", label: "Reste seul à la maison" }, { id: "cuisine", label: "Cuisine seul" }, { id: "ecouteurs", label: "Souvent avec des écouteurs" }] };
    case "adulte":
      return { aide: "Ce qui peut retarder une réaction en cas de souci.", options: [{ id: "sommeil", label: "Sommeil profond" }, { id: "absent", label: "Souvent en déplacement" }, { id: "tard", label: "Rentre tard le soir" }] };
    case "senior":
      return { aide: "Ce qui augmente le risque de chute ou d'oubli.", options: [{ id: "memoire", label: "Troubles de mémoire" }, { id: "nuit", label: "Se lève la nuit" }, { id: "equilibre", label: "Équilibre fragile" }] };
  }
}

/** Niveau gradué (0 à 3) gardé dans `contraintes` sous la forme « vue:2 » : la base n'a qu'un booléen. */
export function niveau(contraintes: string[] | undefined, cle: "vue" | "audition", reduit: boolean): number {
  const n = Number((contraintes ?? []).find((c) => c.startsWith(`${cle}:`))?.split(":")[1]);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : reduit ? SEUIL_REDUIT : 0;
}
export function avecNiveau(contraintes: string[] | undefined, cle: "vue" | "audition", n: number): string[] {
  return [...(contraintes ?? []).filter((c) => !c.startsWith(`${cle}:`)), `${cle}:${n}`];
}
