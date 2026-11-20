import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { completerEmbeddings, contexteGraphe, elementProche, embarquer, type ContexteGraphe } from "@/lib/graphe";
import { expliquerAction, type FaitsAction } from "@/lib/llm";
import type { Database } from "@/lib/supabase/types";

/**
 * Plan d'action d'un logement (issue #13, version simple du 18/11).
 *
 * Le verdict est calculé ici, de façon déterministe, sur les règles validées (`regles_en_vigueur`)
 * et les obligations du contrat dont la citation a été retrouvée dans le PDF. Aucun LLM ne
 * touche au verdict : l'explication est un texte construit à partir de la règle et de sa source.
 * Ordre de force : contrat (clause et page), puis loi, puis recommandé.
 * Profils : une condition de règle est remplie si au moins un occupant la remplit
 * (la règle qui protège l'occupant le plus vulnérable s'applique).
 *
 * Idempotent : les actions encore « proposee » et les diagnostics du logement sont recalculés ;
 * une action déjà lancée (agent, faite) n'est jamais effacée.
 *
 * GraphRAG (`lib/graphe`) : chaque faille est vectorisée, rapprochée des nœuds du graphe
 * (`match_noeuds`), puis étendue à 2 sauts (`sous_graphe`). Le graphe sert à reconnaître un
 * élément que la vision nomme hors vocabulaire, et à nourrir l'explication. Il ne décide de rien.
 * Explication (`lib/llm`) : rédigée par un LLM à partir des faits calculés ici, relue par un
 * garde-fou ; sinon le texte de règle ci-dessous. Sans `HF_TOKEN`, ces deux étapes sont sautées.
 */

type Admin = SupabaseClient<Database>;

type Regle = {
  id: string;
  code: string;
  version: number;
  intitule: string;
  element: string;
  force: string;
  verdict_type: string | null;
  parametres: Record<string, unknown>;
  source_ref: string | null;
};

type Condition = { regle_id: string; groupe: number; axe: string; operateur: string; valeur: string };

type Faille = {
  id: string;
  element: string;
  piece: string | null;
  risque: string;
  largeur_cm: number | null;
  longueur_cm: number | null;
  hauteur_cm: number | null;
  /** Cote confirmée par l'utilisateur : l'action est prête pour l'agent, elle passe devant à rang égal. */
  cotes_confirmees_le: string | null;
  created_at: string;
  origine?: string | null;
};

/** Point ajouté par le plan quand la vidéo ne montre aucun détecteur de fumée (obligation légale). */
export const ORIGINE_ABSENT_VIDEO = "absence_video";
const NORME_DAAF = "NF EN 14604";

type Occupant = { deplacement: number; vue_reduite: boolean; audition_reduite: boolean; vigilance: string };

type Obligation = {
  id: string;
  type: string;
  element: string | null;
  texte_court: string | null;
  clause: string | null;
  page: number;
  liee_absence: boolean;
};

export type Verdict = "non_conforme" | "a_verifier" | "conforme";

export type ResultatPlan = {
  actions: number;
  diagnostics: number;
  failles: number;
  ignorees: number;
  /** Failles pour lesquelles le graphe a fourni un contexte, et éléments reconnus grâce à lui. */
  graphe: {
    contextes: number;
    elements_reconnus: number;
    embeddings_calcules: number;
    /** Éléments que la vision nomme hors vocabulaire, avec le nœud Element le plus proche et ses scores. */
    hors_vocabulaire: { element: string; proche: string; similarite: number; second: number; retenu: boolean }[];
  };
  /** Explications rédigées par le LLM et acceptées par le garde-fou. */
  explications_llm: number;
};

/**
 * Texte de recherche d'une faille : même forme que le texte des nœuds Element (« Element : Tapis »).
 * La pièce, le risque et les cotes n'y figurent pas : mesurés en production, ils tiraient toutes
 * les failles vers le même nœud.
 */
function texteFaille(f: Faille): string {
  return `Element : ${f.element.replace(/_/g, " ")}`;
}

/** Libellés du sous-graphe qui concernent l'élément ou la règle retenue : matière de l'explication. */
function contexteUtile(c: ContexteGraphe | null, element: string, codeRegle: string | null): string[] {
  if (!c) return [];
  return c.voisins
    .filter((n) => ["ContreMesure", "Clause", "Regle"].includes(n.type))
    .filter((n) => n.proprietes?.element === element || (codeRegle !== null && (n.proprietes?.code_regle === codeRegle || n.proprietes?.code === codeRegle)))
    .slice(0, 5)
    .map((n) => `${n.type} : ${n.libelle}`);
}

const FORCE_RANG: Record<string, number> = { contrat: 0, loi: 1, recommande: 2, information: 3 };

/** Vocabulaire de la vision → vocabulaire commun (`elements`). « porte » seule : entrée si la pièce le dit. */
export function elementCommun(element: string, piece: string | null): string {
  const e = element.toLowerCase().trim();
  if (e === "porte") return /entr[ée]e/i.test(piece ?? "") ? "porte_entree" : "porte_interieure";
  if (e === "seuil") return "ressaut";
  return e;
}

/** Vrai si la clause vise la porte d'entrée ou d'accès du logement. */
export function visePorteEntree(o: { texte_court?: string | null; clause?: string | null }): boolean {
  return /porte\s+d\s*['’]\s*(entr[ée]e|acc[eè]s)/iu.test(`${o.texte_court ?? ""} ${o.clause ?? ""}`);
}

function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function comparer(gauche: unknown, operateur: string, droite: string): boolean {
  const a = nombre(gauche);
  const b = nombre(droite);
  if (a !== null && b !== null) {
    switch (operateur) {
      case ">=": return a >= b;
      case ">": return a > b;
      case "<=": return a <= b;
      case "<": return a < b;
      case "!=": case "<>": return a !== b;
      default: return a === b;
    }
  }
  const g = String(gauche);
  return operateur === "!=" || operateur === "<>" ? g !== droite : g === droite;
}

/** Conditions d'une règle : groupes reliés par OU, conditions d'un groupe reliées par ET. */
export function regleApplicable(
  conditions: Condition[],
  occupants: Occupant[],
  logement: { statut_occupation: string | null },
): boolean {
  if (!conditions.length) return true;
  const groupes = new Map<number, Condition[]>();
  for (const c of conditions) groupes.set(c.groupe, [...(groupes.get(c.groupe) ?? []), c]);
  const profils = occupants.length ? occupants : [{ deplacement: 0, vue_reduite: false, audition_reduite: false, vigilance: "adulte" }];
  for (const groupe of groupes.values()) {
    const ok = groupe.every((c) => {
      if (c.axe === "statut_occupation") return comparer(logement.statut_occupation, c.operateur, c.valeur);
      if (c.axe === "absence") return false; // règles d'absence : traitées par le mode absence, pas par le plan
      return profils.some((o) => comparer((o as Record<string, unknown>)[c.axe], c.operateur, c.valeur));
    });
    if (ok) return true;
  }
  return false;
}

/** Verdict d'une règle sur une faille mesurée. `null` : la règle ne porte pas sur une faille vue en vidéo. */
export function evaluer(regle: Regle, f: Faille): { verdict: Verdict; mesure: string | null; seuil: string | null } | null {
  const p = regle.parametres ?? {};
  switch (regle.verdict_type) {
    case "seuil_min": {
      const min = nombre(p.passage_utile_min_cm ?? Object.entries(p).find(([k]) => k.endsWith("_min_cm"))?.[1]);
      if (min === null) return { verdict: "a_verifier", mesure: null, seuil: null };
      if (f.largeur_cm === null) return { verdict: "a_verifier", mesure: null, seuil: `≥ ${min} cm` };
      return { verdict: f.largeur_cm < min ? "non_conforme" : "conforme", mesure: `${Math.round(f.largeur_cm)} cm`, seuil: `≥ ${min} cm` };
    }
    case "seuil_max": {
      const max = nombre(p.hauteur_max_cm);
      if (max === null || f.hauteur_cm === null) return { verdict: "a_verifier", mesure: null, seuil: max === null ? null : `≤ ${max} cm` };
      return { verdict: f.hauteur_cm > max ? "non_conforme" : "conforme", mesure: `${Math.round(f.hauteur_cm)} cm`, seuil: `≤ ${max} cm` };
    }
    case "intervalle": {
      const min = nombre(p.hauteur_min_cm);
      const max = nombre(p.hauteur_max_cm);
      if (f.hauteur_cm === null || min === null || max === null) return { verdict: "a_verifier", mesure: null, seuil: null };
      const ok = f.hauteur_cm >= min && f.hauteur_cm <= max;
      return { verdict: ok ? "conforme" : "non_conforme", mesure: `${Math.round(f.hauteur_cm)} cm`, seuil: `${min} à ${max} cm` };
    }
    case "presence":
    case "seuils":
      // La vidéo montre l'élément, pas s'il est déjà sécurisé : on le fait vérifier.
      return { verdict: "a_verifier", mesure: null, seuil: null };
    default:
      return null; // declaration, information, delai : hors plan des failles
  }
}

/** Contre-mesure concrète et usage de l'agent (2 = objets) pour un élément. */
export function contreMesure(element: string, f: Faille, seuil: string | null, intitule: string): { texte: string; usage: 2 | null } {
  const dims =
    f.largeur_cm !== null && f.longueur_cm !== null
      ? ` ${Math.round(f.largeur_cm)} × ${Math.round(f.longueur_cm)} cm`
      : "";
  switch (element) {
    case "tapis":
      return { texte: `Sous-tapis antidérapant${dims}`, usage: 2 };
    // IKEA France ne vend pas de rampe de seuil (recherche du 20/11) : c'est un artisan qui la pose.
    case "ressaut":
      return { texte: "Rampe de seuil pour supprimer le ressaut", usage: null };
    // Libellé au vocabulaire d'IKEA (« éclairage LED avec capteur ») : c'est ce que l'agent cherche.
    case "eclairage":
      return { texte: "Éclairage LED à détecteur de mouvement, sans fil", usage: 2 };
    case "porte_entree":
    case "porte_interieure":
      return { texte: `Élargir le passage de la porte (passage utile ${seuil ?? "conforme"})`, usage: null };
    case "main_courante":
      return { texte: "Poser une main courante à la bonne hauteur", usage: null };
    // « Verrouiller avec soin » est une habitude, pas des travaux : l'action concrète est une poignée à clé.
    case "fenetre":
      return { texte: "Faire poser des poignées de fenêtre à clé", usage: null };
    // IKEA France ne vend pas de détecteur de fumée (recherche du 20/11) : l'agent le cherche sur Castorama.
    case "detecteur_fumee":
      return f.origine === ORIGINE_ABSENT_VIDEO
        ? { texte: `Détecteur de fumée marqué ${NORME_DAAF}`, usage: 2 }
        : { texte: `Tester le détecteur de fumée et vérifier qu'il porte la norme ${NORME_DAAF}`, usage: null };
    default:
      return { texte: intitule, usage: null };
  }
}

function explication(regle: Regle, verdict: Verdict, mesure: string | null, seuil: string | null): string {
  const source = regle.source_ref ? ` Source : ${regle.source_ref}.` : "";
  if (verdict === "non_conforme" && mesure && seuil) return `Mesuré sur votre vidéo : ${mesure}, pour un seuil ${seuil}. ${regle.intitule}.${source}`;
  if (verdict === "a_verifier") return `${regle.intitule}. À vérifier sur place.${source}`;
  return `${regle.intitule}.${source}`;
}

function gravite(risque: string, verdict: Verdict, occupants: Occupant[]): 1 | 2 | 3 {
  const fragile = occupants.some((o) => o.deplacement >= 2 || o.vue_reduite || o.vigilance === "troubles_cognitifs");
  if (verdict === "non_conforme") return 3;
  if (risque === "chute" && fragile) return 3;
  return 2;
}

/** Calcule et enregistre le plan d'action du logement. À appeler avec le client service_role, propriété vérifiée. */
export async function calculerPlan(admin: Admin, logementId: string): Promise<ResultatPlan> {
  await synchroniserDetecteurAbsent(admin, logementId);
  const [lg, fls, occ, rgl, ctr] = await Promise.all([
    admin.from("logements").select("id, statut_occupation").eq("id", logementId).single(),
    admin.from("failles").select("id, element, piece, risque, largeur_cm, longueur_cm, hauteur_cm, cotes_confirmees_le, created_at, origine").eq("logement_id", logementId),
    admin.from("occupants").select("deplacement, vue_reduite, audition_reduite, vigilance").eq("logement_id", logementId),
    admin.from("regles_en_vigueur").select("id, code, version, intitule, element, force, verdict_type, parametres, source_ref"),
    admin
      .from("contrats")
      .select("id, obligations_contrat(id, type, element, texte_court, clause, page, liee_absence, citation_retrouvee)")
      .eq("logement_id", logementId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (lg.error || !lg.data) throw new Error("Logement introuvable.");
  for (const r of [fls, occ, rgl, ctr]) if (r.error) throw new Error(r.error.message);

  const regles = (rgl.data ?? []) as unknown as Regle[];
  const { data: conds, error: errC } = await admin
    .from("regle_conditions")
    .select("regle_id, groupe, axe, operateur, valeur")
    .in("regle_id", regles.map((r) => r.id).length ? regles.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);
  if (errC) throw new Error(errC.message);

  const failles = ((fls.data ?? []) as unknown as Faille[]).map((f) => ({
    ...f,
    largeur_cm: nombre(f.largeur_cm),
    longueur_cm: nombre(f.longueur_cm),
    hauteur_cm: nombre(f.hauteur_cm),
  }));
  const occupants = (occ.data ?? []) as Occupant[];
  type ObligationLue = Obligation & { citation_retrouvee: boolean };
  const obligations = (((ctr.data?.[0]?.obligations_contrat ?? []) as unknown as ObligationLue[]).filter(
    (o) => o.citation_retrouvee && o.type === "prevention" && !o.liee_absence,
  ));

  // Actions déjà engagées : on ne les touche pas, et on ne double pas leur faille.
  const ids = failles.map((f) => f.id);
  const { data: existantes } = ids.length
    ? await admin.from("actions").select("id, faille_id, statut").in("faille_id", ids)
    : { data: [] as { id: string; faille_id: string | null; statut: string }[] };
  const engagees = new Set((existantes ?? []).filter((a) => a.statut !== "proposee").map((a) => a.faille_id));

  // GraphRAG : embeddings manquants complétés, puis une recherche par faille (tout est facultatif).
  const contratId = ctr.data?.[0]?.id ?? null;
  const embeddingsCalcules = await completerEmbeddings(admin, contratId).catch(() => 0);
  const vecteurs = failles.length ? await embarquer(failles.map(texteFaille)) : null;
  const contextes = new Map<string, ContexteGraphe | null>();
  if (vecteurs) {
    const lus = await Promise.all(failles.map((_, i) => contexteGraphe(admin, vecteurs[i], contratId).catch(() => null)));
    failles.forEach((f, i) => contextes.set(f.id, lus[i]));
  }
  const elementsConnus = new Set([...regles.map((r) => r.element), ...obligations.map((o) => o.element).filter(Boolean)]);
  let elementsReconnus = 0;
  const arrondi = (x: number) => Math.round(x * 1000) / 1000;
  const horsVocabulaire: ResultatPlan["graphe"]["hors_vocabulaire"] = [];

  type Ligne = {
    faille: Faille;
    element: string;
    mesure: string | null;
    seuil: string | null;
    regle: Regle | null;
    obligation: Obligation | null;
    force: string;
    verdict: Verdict;
    texte: string;
    usage: 2 | null;
    explication: string;
    gravite: 1 | 2 | 3;
    /** Explication fixée par le code : pas de reformulation par le LLM. */
    fixe?: boolean;
  };
  const lignes: Ligne[] = [];
  const diagnostics: { logement_id: string; faille_id: string; regle_id: string; regle_version: number; verdict: Verdict }[] = [];
  let ignorees = 0;
  const obligationsRetenues = new Set<string>();

  for (const f of failles) {
    let element = elementCommun(f.element, f.piece);
    if (!elementsConnus.has(element)) {
      // Élément hors vocabulaire : on prend le nœud Element le plus proche, s'il ressemble nettement.
      const proche = elementProche(contextes.get(f.id) ?? null);
      if (proche) horsVocabulaire.push({ element: f.element, proche: proche.element, similarite: arrondi(proche.similarite), second: arrondi(proche.second), retenu: proche.retenu });
      if (proche?.retenu && elementsConnus.has(proche.element)) {
        element = proche.element;
        elementsReconnus++;
      }
    }
    const candidates = regles.filter(
      (r) => r.element === element && regleApplicable((conds ?? []).filter((c) => c.regle_id === r.id), occupants, lg.data),
    );
    let retenue: Omit<Ligne, "faille"> | null = null;
    for (const r of candidates) {
      const ev = evaluer(r, f);
      if (!ev) continue;
      diagnostics.push({ logement_id: logementId, faille_id: f.id, regle_id: r.id, regle_version: r.version, verdict: ev.verdict });
      if (ev.verdict === "conforme") continue;
      const cm = contreMesure(element, f, ev.seuil, r.intitule);
      const ligne = {
        element,
        mesure: ev.mesure,
        seuil: ev.seuil,
        regle: r,
        obligation: null,
        force: r.force === "loi" ? "loi" : r.force === "information" ? "information" : "recommande",
        verdict: ev.verdict,
        texte: cm.texte,
        usage: cm.usage,
        explication: explication(r, ev.verdict, ev.mesure, ev.seuil),
        gravite: gravite(f.risque, ev.verdict, occupants),
      };
      if (!retenue || FORCE_RANG[ligne.force] < FORCE_RANG[retenue.force] || (ligne.verdict === "non_conforme" && retenue.verdict !== "non_conforme"))
        retenue = ligne;
    }
    // Le contrat passe avant la loi et le recommandé, avec sa clause et sa page.
    // Une clause qui vise la porte d'entrée ne s'applique qu'au point repéré dans l'entrée (et une seule
    // fois) : la serrure de la salle de bain ne doit pas hériter de la serrure 3 points du contrat.
    const ob = obligations.find(
      (o) => o.element === element && !obligationsRetenues.has(o.id) && (!visePorteEntree(o) || /entr[ée]e/i.test(f.piece ?? "")),
    );
    if (ob) {
      obligationsRetenues.add(ob.id);
      const cm = contreMesure(element, f, null, ob.texte_court ?? "Exigence du contrat");
      retenue = {
        element,
        mesure: retenue?.mesure ?? null,
        seuil: retenue?.seuil ?? null,
        regle: retenue?.regle ?? null,
        obligation: ob,
        force: "contrat",
        verdict: retenue?.verdict ?? "a_verifier",
        texte: retenue?.texte ?? ob.texte_court ?? cm.texte,
        usage: retenue?.usage ?? cm.usage,
        explication: `Exigé par votre contrat : ${ob.texte_court ?? ob.clause ?? "clause du contrat"} (${ob.clause ?? "clause"}, p. ${ob.page}).`,
        gravite: 3,
      };
    }
    if (retenue && f.origine === ORIGINE_ABSENT_VIDEO) {
      // Rien n'a été vu : on ne conclut pas à l'absence, on la signale et on demande.
      retenue = {
        ...retenue,
        gravite: 3,
        fixe: true,
        explication: `Aucun détecteur de fumée n'a été repéré sur votre vidéo. Tout logement doit en avoir au moins un${retenue.regle?.source_ref ? ` (${retenue.regle.source_ref.replace(/\s*\(Légifrance\)/, "")})` : ""} : choisissez un modèle autonome marqué ${NORME_DAAF} et CE, à fixer au plafond, de préférence près des chambres. Si vous en avez déjà un, dites-le.`,
      };
    }
    if (!retenue) {
      ignorees++;
      continue;
    }
    if (engagees.has(f.id)) continue;
    lignes.push({ faille: f, ...retenue });
  }

  lignes.sort(
    (a, b) =>
      FORCE_RANG[a.force] - FORCE_RANG[b.force] ||
      b.gravite - a.gravite ||
      (a.faille.risque === "chute" ? 0 : 1) - (b.faille.risque === "chute" ? 0 : 1) ||
      // À rang égal : d'abord ce qui est prêt pour l'agent (cote confirmée), puis un ordre fixe.
      // Sans départage, l'ordre changeait à chaque recalcul et le plan se réorganisait sous l'utilisateur.
      (a.faille.cotes_confirmees_le ? 0 : 1) - (b.faille.cotes_confirmees_le ? 0 : 1) ||
      a.faille.created_at.localeCompare(b.faille.created_at) ||
      a.faille.id.localeCompare(b.faille.id),
  );

  // Explication par LLM, en parallèle, sur les faits déjà calculés. Le verdict ne change pas ;
  // un texte refusé par le garde-fou ou une erreur laissent l'explication de règle.
  let explicationsLlm = 0;
  await Promise.all(
    lignes.map(async (l) => {
      if (l.fixe) return;
      const faits: FaitsAction = {
        element: l.element.replace(/_/g, " "),
        piece: l.faille.piece,
        mesure: l.mesure,
        seuil: l.seuil,
        verdict: l.verdict === "non_conforme" ? "non_conforme" : "a_verifier",
        force: l.force as FaitsAction["force"],
        contre_mesure: l.texte,
        regle: l.regle?.intitule ?? null,
        source: l.regle?.source_ref ?? null,
        clause: l.obligation
          ? { texte: l.obligation.texte_court ?? "", reference: l.obligation.clause ?? "clause du contrat", page: l.obligation.page }
          : null,
        contexte: contexteUtile(contextes.get(l.faille.id) ?? null, l.element, l.regle?.code ?? null),
      };
      const texte = await expliquerAction(faits);
      if (texte) {
        l.explication = texte;
        explicationsLlm++;
      }
    }),
  );

  // Recalcul : les diagnostics du logement sont remplacés ; les actions encore proposées sont mises
  // à jour sur place (voir plus bas), pour garder leur identifiant.
  const delD = await admin.from("diagnostic_regles").delete().eq("logement_id", logementId);
  if (delD.error) throw new Error(delD.error.message);

  if (diagnostics.length) {
    const ins = await admin.from("diagnostic_regles").insert(diagnostics as never);
    if (ins.error) throw new Error(ins.error.message);
  }

  const debut = engagees.size + 1;
  const actions = lignes.map((l, i) => ({
    faille_id: l.faille.id,
    usage: l.usage,
    contre_mesure: l.texte,
    statut: "proposee",
    priorite: debut + i,
    force: l.force,
    obligation_id: l.obligation?.id ?? null,
    regle_id: l.regle?.id ?? null,
    explication: l.explication,
  }));
  // Une action « contrat » doit citer son obligation ; « loi » et « recommandé » leur règle (contraintes 0008).
  const valides = actions.filter((a) => (a.force === "contrat" ? a.obligation_id : a.force === "information" || a.regle_id));
  // Une action proposée garde son identifiant d'un recalcul à l'autre : une page ouverte (plan
  // d'action, mission en cours de lancement) ne doit pas pointer sur une action disparue.
  const proposees = new Map<string, string>();
  const enTrop: string[] = [];
  for (const a of existantes ?? []) {
    if (a.statut !== "proposee" || !a.faille_id) continue;
    if (proposees.has(a.faille_id)) enTrop.push(a.id);
    else proposees.set(a.faille_id, a.id);
  }
  const gardees = new Set<string>();
  const nouvelles: typeof valides = [];
  for (const a of valides) {
    const id = proposees.get(a.faille_id);
    if (!id) {
      nouvelles.push(a);
      continue;
    }
    gardees.add(id);
    const maj = await admin.from("actions").update(a as never).eq("id", id);
    if (maj.error) throw new Error(maj.error.message);
  }
  const aSupprimer = [...enTrop, ...[...proposees.values()].filter((id) => !gardees.has(id))];
  if (aSupprimer.length) {
    const del = await admin.from("actions").delete().in("id", aSupprimer).eq("statut", "proposee");
    if (del.error) throw new Error(del.error.message);
  }
  if (nouvelles.length) {
    const ins = await admin.from("actions").insert(nouvelles as never);
    if (ins.error) throw new Error(ins.error.message);
  }

  for (const l of lignes) {
    const i = lignes.indexOf(l);
    await admin.from("failles").update({ gravite: l.gravite, priorite: debut + i } as never).eq("id", l.faille.id);
  }

  return {
    actions: valides.length,
    diagnostics: diagnostics.length,
    failles: failles.length,
    ignorees,
    graphe: {
      contextes: [...contextes.values()].filter(Boolean).length,
      elements_reconnus: elementsReconnus,
      embeddings_calcules: embeddingsCalcules,
      hors_vocabulaire: horsVocabulaire,
    },
    explications_llm: explicationsLlm,
  };
}

/**
 * Détecteur de fumée (obligation légale, règle DAAF) : la vision ne peut que le voir, pas prouver
 * qu'il manque. Sans détecteur repéré ni réponse « j'en ai un », le plan ajoute un point
 * « détecteur non repéré » qui pose la question ; il disparaît dès qu'un détecteur est vu ou déclaré.
 */
export async function synchroniserDetecteurAbsent(admin: Admin, logementId: string): Promise<void> {
  const [regle, vus, decl] = await Promise.all([
    admin.from("regles_en_vigueur").select("id").eq("element", "detecteur_fumee").limit(1),
    admin.from("failles").select("id, origine").eq("logement_id", logementId).eq("element", "detecteur_fumee"),
    admin
      .from("declarations")
      .select("valeur")
      .eq("logement_id", logementId)
      .eq("element", "detecteur_fumee")
      .order("declare_le", { ascending: false })
      .limit(1),
  ]);
  if (regle.error || vus.error || decl.error) return; // facultatif : le plan se calcule sans
  const synthetiques = (vus.data ?? []).filter((f) => f.origine === ORIGINE_ABSENT_VIDEO);
  const vuEnVideo = (vus.data ?? []).some((f) => f.origine !== ORIGINE_ABSENT_VIDEO);
  const declare = decl.data?.[0]?.valeur === "present";
  const attendu = Boolean(regle.data?.length) && !vuEnVideo && !declare;
  if (attendu && synthetiques.length === 0) {
    const { error } = await admin.from("failles").insert({
      logement_id: logementId,
      element: "detecteur_fumee",
      risque: "incendie",
      source: "declaration",
      origine: ORIGINE_ABSENT_VIDEO,
      piece: null,
    } as never);
    // Facultatif, mais jamais en silence : la première version échouait sur une contrainte (migration 0015).
    if (error) console.error("[plan] point « détecteur non repéré » non créé", logementId, error.message);
  } else if (!attendu && synthetiques.length) {
    await admin.from("failles").delete().in("id", synthetiques.map((f) => f.id)).eq("origine", ORIGINE_ABSENT_VIDEO);
  }
}
