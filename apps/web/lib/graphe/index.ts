import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * GraphRAG (architecture v3, section 7) : recherche par similarité dans `graphe_noeuds`
 * (pgvector, embeddings BAAI/bge-m3 en 1024 dimensions), puis sous-graphe à 2 sauts.
 *
 * Tout est optionnel : sans `HF_TOKEN`, ou si Hugging Face ne répond pas, les fonctions
 * renvoient `null` et le plan garde son calcul par code d'élément. Le graphe n'écrit jamais
 * de verdict : il aide à reconnaître l'élément et fournit le contexte de l'explication.
 */

type Admin = SupabaseClient<Database>;

const URL_EMBEDDING =
  process.env.HF_EMBEDDING_URL ?? "https://router.huggingface.co/hf-inference/models/BAAI/bge-m3/pipeline/feature-extraction";
const DIMENSION = 1024;

export type NoeudGraphe = {
  id: string;
  type: string;
  libelle: string;
  proprietes: Record<string, unknown>;
  regle_id: string | null;
  contrat_id: string | null;
  similarite?: number;
  distance?: number;
};

export type ContexteGraphe = {
  /** Nœuds les plus proches de la faille, du plus au moins semblable. */
  proches: NoeudGraphe[];
  /** Sous-graphe à 2 sauts autour des nœuds proches. */
  voisins: NoeudGraphe[];
};

/** Embeddings de plusieurs textes en un appel. `null` si le service n'est pas disponible. */
export async function embarquer(textes: string[]): Promise<number[][] | null> {
  const jeton = process.env.HF_TOKEN;
  if (!jeton || !textes.length) return null;
  try {
    const r = await fetch(URL_EMBEDDING, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: textes, normalize: true, truncate: true }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const v = (await r.json()) as unknown;
    if (!Array.isArray(v) || v.length !== textes.length) return null;
    const ok = v.every((x) => Array.isArray(x) && x.length === DIMENSION && x.every((n) => typeof n === "number"));
    return ok ? (v as number[][]) : null;
  } catch {
    return null;
  }
}

function texteNoeud(n: { type: string; libelle: string; proprietes: unknown }): string {
  const p = (n.proprietes ?? {}) as Record<string, unknown>;
  // Element : ses synonymes (seed) ; Clause : sa citation ; Regle : sa source.
  const complement = [p.synonymes, p.citation, p.source_ref].filter((x): x is string => typeof x === "string" && !!x).join(" — ");
  return `${n.type} : ${n.libelle}${complement ? ` (${complement})` : ""}`;
}

/**
 * Calcule les embeddings manquants des nœuds publics et, s'il est donné, des nœuds du contrat.
 * Idempotent, borné à 96 nœuds par appel. Renvoie le nombre de nœuds complétés.
 */
export async function completerEmbeddings(admin: Admin, contratId?: string | null): Promise<number> {
  if (!process.env.HF_TOKEN) return 0;
  let requete = admin.from("graphe_noeuds").select("id, type, libelle, proprietes, contrat_id").is("embedding", null).limit(96);
  requete = contratId ? requete.or(`contrat_id.is.null,contrat_id.eq.${contratId}`) : requete.is("contrat_id", null);
  const { data: noeuds } = await requete;
  if (!noeuds?.length) return 0;
  const vecteurs = await embarquer(noeuds.map(texteNoeud));
  if (!vecteurs) return 0;
  const resultats = await Promise.all(
    noeuds.map((n, i) => admin.from("graphe_noeuds").update({ embedding: JSON.stringify(vecteurs[i]) } as never).eq("id", n.id)),
  );
  return resultats.filter((r) => !r.error).length;
}

/** Contexte du graphe pour une faille déjà vectorisée : nœuds proches, puis sous-graphe à 2 sauts. */
export async function contexteGraphe(admin: Admin, vecteur: number[], contratId: string | null): Promise<ContexteGraphe | null> {
  const { data: proches, error } = await admin.rpc("match_noeuds", {
    query_embedding: JSON.stringify(vecteur),
    k: 14,
    p_contrat_id: contratId ?? undefined,
  } as never);
  if (error || !Array.isArray(proches) || !proches.length) return null;
  const tetes = (proches as NoeudGraphe[]).slice(0, 3).map((n) => n.id);
  const { data: sous } = await admin.rpc("sous_graphe", { noeud_ids: tetes, profondeur: 2, p_contrat_id: contratId ?? undefined } as never);
  const voisins = ((sous as { noeuds?: NoeudGraphe[] } | null)?.noeuds ?? []) as NoeudGraphe[];
  return { proches: proches as NoeudGraphe[], voisins };
}

/**
 * Code d'élément du nœud Element le plus proche. bge-m3 donne des similarités resserrées :
 * le score seul ne distingue rien (mesuré le 18/11 avec les synonymes : « canapé » 0,70 vers un
 * mauvais nœud, « paillasson » 0,60 vers le bon). C'est l'écart avec le deuxième élément qui
 * sépare : 0,06 pour les deux bons rapprochements nets (seuil de porte → ressaut, lampe de
 * chevet → éclairage), 0,02 au plus pour les cinq autres. D'où un écart minimal de 0,04.
 * Réglage fait sur 7 exemples seulement : à revoir avec de vraies vidéos.
 */
export function elementProche(
  contexte: ContexteGraphe | null,
  seuil = SEUIL_ELEMENT,
  ecart = ECART_ELEMENT,
): { element: string; similarite: number; second: number; retenu: boolean } | null {
  const elements = (contexte?.proches ?? []).filter((x) => x.type === "Element" && typeof x.proprietes?.element === "string");
  if (!elements.length) return null;
  const [a, b] = elements;
  const similarite = a.similarite ?? 0;
  const second = b?.similarite ?? 0;
  return { element: a.proprietes.element as string, similarite, second, retenu: similarite >= seuil && similarite - second >= ecart };
}

export const SEUIL_ELEMENT = Number(process.env.GRAPHE_SEUIL_ELEMENT ?? 0.6);
export const ECART_ELEMENT = Number(process.env.GRAPHE_ECART_ELEMENT ?? 0.04);
