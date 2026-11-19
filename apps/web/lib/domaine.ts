/**
 * Types du domaine vus par l'interface. Ils reprennent les colonnes de Supabase
 * (`lib/supabase/types.ts`) sous une forme prête à afficher. Le logement exemple
 * (`lib/demo/logement-exemple.ts`) et les données réelles produisent les mêmes types.
 */

export type Risque = "chute" | "intrusion" | "incendie" | "autre";

/** Gravité 1 à 3 (colonne `failles.gravite`), plus « critique » pour l'occupant le plus vulnérable. */
export type Niveau = "critique" | "eleve" | "modere" | "surveiller";

/** Ordre du verdict : contrat (clause et page), puis loi (Légifrance), puis recommandé. */
export type Force = "contrat" | "loi" | "recommande";

export type Source =
  | { force: "contrat"; clause: string; page: number }
  | { force: "loi"; reference: string; url: string }
  | { force: "recommande"; reference: string };

export type Occupant = {
  /** Identifiant en base (absent pour le logement exemple ou un occupant pas encore enregistré). */
  id?: string;
  libelle: string;
  age?: number;
  /** Capacité de déplacement, de 0 (aucune gêne) à 4 (fauteuil). */
  deplacement: 0 | 1 | 2 | 3 | 4;
  vue_reduite: boolean;
  audition_reduite: boolean;
  troubles_memoire: boolean;
  consentement_art9_le: string | null;
  /** Profil complet (migration 0011), facultatif. Jamais transmis à l'agent. */
  nom?: string | null;
  naissance?: string | null;
  contraintes?: string[];
  autre?: string | null;
};

export type Piece = {
  id: string;
  nom: string;
  /** État de la vidéo et de l'analyse de la pièce. */
  video?: { duree_s: number; resolution: string; taille_mo: number };
  analyse: "en_attente" | "en_cours" | "terminee" | "echec";
  progression?: number;
  /** Modèle 3D de la pièce (bucket privé `modeles3d`), en URL signée de courte durée. */
  modele_url?: string | null;
  /** Image de la vidéo où les éléments repérés sont encadrés avec leur cote (bucket privé `exports`), en URL signée. */
  image_url?: string | null;
};

export type Cote = {
  libelle: string;
  largeur_cm: number;
  longueur_cm: number;
  statut: "a_confirmer" | "confirmee";
};

export type Faille = {
  id: string;
  piece_id: string;
  titre: string;
  element: string;
  risque: Risque;
  niveau: Niveau;
  description: string;
  source: Source;
  cote?: Cote;
  /** Origine de la mesure : pipeline vision, plan B précalculé, ou saisie manuelle. */
  origine: "pipeline" | "precalcule" | "manuel";
  statut: "a_traiter" | "en_traitement" | "regle" | "a_surveiller";
  /** Position de l'élément dans le modèle 3D de sa pièce (repère du .glb, en mètres), quand la vision la donne. */
  repere_3d?: [number, number, number] | null;
  /** « Photo en relief » du point dans le modèle 3D de sa pièce (nœud, caméra d'origine, point regardé). */
  relief?: { noeud: string; camera: [number, number, number]; cible: [number, number, number] } | null;
  /** Tranche de l'image de la pièce qui montre ce point (planche de vignettes empilées), quand la vision la donne. */
  vignette?: { index: number; total: number; largeur: number; hauteur: number; boite: [number, number, number, number] | null } | null;
};

export type Action = {
  id: string;
  faille_id: string;
  priorite: number;
  titre: string;
  niveau: Niveau;
  source: Source;
  detail: string;
  /** Mission confiée à l'agent H, et son usage (1, 2 ou 3) ; `null` : pas pour l'agent (travaux, artisan). */
  mission: string;
  usage: 1 | 2 | 3 | null;
  groupe: "priorite" | "contrat" | "plus_tard";
};

export type PropositionAgent = {
  action: "panier" | "envoi";
  resume: string;
  produit: string;
  montant_eur: number;
  url: string;
  dimensions?: string;
  citation_decoupe?: string;
};

export type Absence = {
  depart_le: string;
  retour_le: string;
  motif: string;
};

export type Contrat = {
  assureur: string;
  formule: string;
  reference_cg: string;
  /** Clause d'inoccupation lue dans les conditions générales (clause et page obligatoires). */
  inoccupation?: { duree_max_jours: number; protections: string[]; clause: string; page: number };
};

export type Logement = {
  id: string;
  exemple: boolean;
  aidant: string;
  /** Premier occupant : celui du parcours d'inscription. */
  occupant: Occupant;
  /** Tous les occupants du logement (la règle qui protège le plus vulnérable s'applique). */
  occupants?: Occupant[];
  /** Adresse du logement (facultative, jamais transmise à l'agent ni au service vision). */
  adresse?: string | null;
  type: string;
  etage: string;
  ascenseur?: boolean | null;
  statut: string;
  zone_otv: "police" | "gendarmerie";
  /** Parcours A avec contrat, B sans. */
  contrat: Contrat | null;
  pieces: Piece[];
  failles: Faille[];
  actions: Action[];
  absence: Absence | null;
};

export const LIBELLE_NIVEAU: Record<Niveau, string> = {
  critique: "Critique",
  eleve: "Élevé",
  modere: "Modéré",
  surveiller: "À surveiller",
};

export const LIBELLE_DEPLACEMENT: Record<Occupant["deplacement"], string> = {
  0: "Sans aide",
  1: "Prudence",
  2: "Avec une canne",
  3: "Avec un déambulateur",
  4: "En fauteuil",
};

export function libelleSource(source: Source): string {
  switch (source.force) {
    case "contrat":
      return `Exigé par votre contrat · p. ${source.page}`;
    case "loi":
      return `Obligation légale · ${source.reference}`;
    case "recommande":
      return source.reference.startsWith("Recommandé") || source.reference.startsWith("Repéré") ? source.reference : `Recommandé · ${source.reference}`;
  }
}

/** Nombre de jours entre deux dates ISO (AAAA-MM-JJ). */
export function dureeJours(debut: string, fin: string): number {
  const ms = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function formaterDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export function formaterEuros(montant: number): string {
  return montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
