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

/* ---------- Brouillon du profil (écrans Profil et Compte, maquette de Hoang-Kim) ---------- */

export const TYPES_LOGEMENT = ["Studio", "T2", "T3", "T4", "T5 +", "Maison"];
export const ETAGES = ["RDC", "1er", "2e", "3e", "4e +"];
export const STATUTS = ["Propriétaire", "Locataire", "Hébergé"];

export type OccupantBrouillon = {
  /** Clé locale stable (l'identifiant en base n'existe pas encore pour un nouvel habitant). */
  cle: string;
  id?: string;
  prenom: string;
  nom: string;
  naissance: string;
  deplacement: number;
  vue: number;
  audition: number;
  /** Points de vigilance (identifiants de `vigilance()`), sans les niveaux de vue et d'audition. */
  vigilance: string[];
  autre: string;
};

export type Brouillon = {
  adresse: string;
  type: string;
  etage: string;
  statut: string;
  ascenseur: boolean;
  occupants: OccupantBrouillon[];
  /** Accord RGPD art. 9 (AAAA-MM-JJ), commun aux habitants ; null tant qu'il n'est pas donné. */
  accordLe: string | null;
};

let compteur = 0;
export const nouvelOccupant = (): OccupantBrouillon => ({
  cle: `nouveau-${Date.now()}-${compteur++}`,
  prenom: "",
  nom: "",
  naissance: "",
  deplacement: 0,
  vue: 0,
  audition: 0,
  vigilance: [],
  autre: "",
});

type OccupantSource = {
  id?: string;
  libelle: string;
  deplacement: number;
  vue_reduite: boolean;
  audition_reduite: boolean;
  troubles_memoire?: boolean;
  consentement_art9_le: string | null;
  nom?: string | null;
  naissance?: string | null;
  contraintes?: string[];
  autre?: string | null;
};

/** Brouillon initial à partir du logement chargé (étage « RDC », « 1e »… ramené aux choix de la maquette). */
export function brouillonDepuis(l: { adresse?: string | null; type: string; etage: string; statut: string; ascenseur?: boolean | null; occupant: OccupantSource; occupants?: OccupantSource[] }): Brouillon {
  const occ = l.occupants?.length ? l.occupants : [l.occupant];
  const n = l.etage === "RDC" ? 0 : parseInt(l.etage, 10);
  return {
    adresse: l.adresse ?? "",
    type: TYPES_LOGEMENT.includes(l.type) ? l.type : l.type === "T5+" ? "T5 +" : "",
    etage: Number.isNaN(n) ? "" : ETAGES[Math.min(n, 4)],
    statut: STATUTS.includes(l.statut) ? l.statut : "",
    ascenseur: Boolean(l.ascenseur),
    accordLe: occ.find((o) => o.consentement_art9_le)?.consentement_art9_le?.slice(0, 10) ?? null,
    occupants: occ.map((o, i) => ({
      cle: o.id ?? `occupant-${i}`,
      id: o.id,
      prenom: o.libelle === "l'occupant" ? "" : o.libelle,
      nom: o.nom ?? "",
      naissance: o.naissance ?? "",
      deplacement: o.deplacement,
      vue: niveau(o.contraintes, "vue", o.vue_reduite),
      audition: niveau(o.contraintes, "audition", o.audition_reduite),
      vigilance: (o.contraintes ?? []).filter((c) => !c.includes(":")).concat(o.troubles_memoire && !(o.contraintes ?? []).includes("memoire") ? ["memoire"] : []),
      autre: o.autre ?? "",
    })),
  };
}

export const nomComplet = (o: OccupantBrouillon) => [o.prenom, o.nom].filter(Boolean).join(" ") || "Sans prénom";

export function resumeOccupant(o: OccupantBrouillon) {
  const age = ageDe(o.naissance);
  if (age === undefined) return "Date de naissance à renseigner";
  const t = trancheDe(age);
  const dep = ECHELLE_DEPLACEMENT[t][o.deplacement];
  return `${age} an${age > 1 ? "s" : ""} · ${TRANCHE_LABEL[t]}${dep ? ` · ${dep.toLowerCase()}` : " · à compléter"}`;
}

export const occupantComplet = (o: OccupantBrouillon) => Boolean(o.prenom.trim()) && ageDe(o.naissance) !== undefined;
export const basesCompletes = (b: Brouillon) => {
  const p = b.occupants[0];
  return Boolean(p && p.prenom.trim() && p.nom.trim() && ageDe(p.naissance) !== undefined && b.adresse.trim());
};
export const logementComplet = (b: Brouillon) => Boolean(b.type && b.etage && b.statut);

const STATUT_BASE = { Propriétaire: "proprietaire", Locataire: "locataire", Hébergé: "heberge" } as const;

/** Conversion du brouillon vers l'action serveur `enregistrerProfilComplet` (écrans Profil et Compte). */
export function versEnregistrement(logementId: string, b: Brouillon) {
  return {
    logement_id: logementId,
    adresse: b.adresse,
    type: b.type,
    etage: b.etage ? ETAGES.indexOf(b.etage) : null,
    statut_occupation: b.statut in STATUT_BASE ? STATUT_BASE[b.statut as keyof typeof STATUT_BASE] : null,
    ascenseur: b.ascenseur,
    accord_le: b.accordLe ?? "",
    occupants: b.occupants.map((o) => ({ id: o.id, prenom: o.prenom, nom: o.nom, naissance: o.naissance, deplacement: o.deplacement, vue: o.vue, audition: o.audition, vigilance: o.vigilance, autre: o.autre })),
  };
}
