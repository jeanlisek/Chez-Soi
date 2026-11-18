import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { completerEmbeddings } from "@/lib/graphe";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Enregistre la lecture d'un contrat (réponse de n8n `analyse_contrat`) : champs du contrat,
 * `obligations_contrat`, nœuds Clause du graphe et arêtes IMPOSE vers les nœuds Règle.
 * n8n n'a aucune clé Supabase : c'est l'app qui écrit, avec le client service_role, après avoir
 * vérifié que le contrat appartient à l'utilisateur.
 *
 * Règle non négociable : une obligation sans clause, sans page ou dont la citation n'a pas été
 * retrouvée dans le PDF est rejetée ici aussi, même si n8n l'a laissée passer.
 */

type Admin = SupabaseClient<Database>;

const TYPES = ["prevention", "inoccupation", "exclusion", "garantie", "franchise", "plafond"] as const;

const obligationSchema = z.object({
  id: z.uuid(),
  type: z.enum(TYPES),
  element: z.string().nullish(),
  seuil: z.number().nullish(),
  unite: z.string().nullish(),
  texte_court: z.string().nullish(),
  citation: z.string().trim().min(1),
  clause: z.string().trim().min(1),
  page: z.number().int().min(1),
  citation_retrouvee: z.literal(true),
});

const noeudSchema = z.object({
  id: z.uuid(),
  type: z.literal("Clause"),
  libelle: z.string().min(1),
  proprietes: z.record(z.string(), z.unknown()).default({}),
});

export const extractionSchema = z.object({
  assureur: z.string().nullish(),
  formule: z.string().nullish(),
  reference_cg: z.string().nullish(),
  obligations: z.array(z.unknown()).default([]),
  noeuds: z.array(z.unknown()).default([]),
});

/** Une obligation liée à l'absence : l'inoccupation, ou une clause qui en parle. */
export function lieeAbsence(o: { type: string; clause: string; citation: string }): boolean {
  return o.type === "inoccupation" || /inoccup|absence|absent|inhabit/i.test(`${o.clause} ${o.citation}`);
}

export async function enregistrerExtraction(
  admin: Admin,
  contrat: { id: string; logement_id: string },
  brut: unknown,
): Promise<{ obligations: number; rejetees: number; noeuds: number; aretes: number }> {
  const e = extractionSchema.parse(brut);

  const obligations: z.infer<typeof obligationSchema>[] = [];
  let rejetees = 0;
  for (const o of e.obligations) {
    const p = obligationSchema.safeParse(o);
    if (p.success) obligations.push(p.data);
    else rejetees++;
  }

  // Le PDF déposé par l'utilisateur est son contrat (conditions particulières) ; les conditions
  // générales arrivent par l'usage 1 (`cg_path`).
  const lignes = obligations.map((o) => ({
    id: o.id,
    contrat_id: contrat.id,
    type: o.type,
    element: o.element?.trim() || null,
    seuil: o.seuil ?? null,
    unite: o.unite?.trim() || null,
    texte_court: o.texte_court?.trim() || null,
    citation: o.citation,
    clause: o.clause,
    page: o.page,
    citation_retrouvee: true,
    confirmee_le: null,
    liee_absence: lieeAbsence(o),
    source: "cp",
  }));
  if (lignes.length) {
    const { error } = await admin.from("obligations_contrat").upsert(lignes as never, { onConflict: "id" });
    if (error) throw new Error(`obligations_contrat : ${error.message}`);
  }
  // Anciennes lignes d'une lecture précédente : supprimées si aucune action ne les cite encore.
  const gardees = new Set(lignes.map((l) => l.id));
  const { data: anciennes } = await admin.from("obligations_contrat").select("id").eq("contrat_id", contrat.id);
  for (const a of anciennes ?? []) {
    if (gardees.has(a.id)) continue;
    const { count } = await admin.from("actions").select("id", { count: "exact", head: true }).eq("obligation_id", a.id);
    if (!count) await admin.from("obligations_contrat").delete().eq("id", a.id);
  }

  // Graphe : nœuds Clause privés (contrat_id) et arêtes IMPOSE vers les règles validées du même élément.
  const valides = new Set(lignes.map((l) => l.id));
  const noeuds = e.noeuds
    .map((n) => noeudSchema.safeParse(n))
    .filter((p) => p.success)
    .map((p) => p.data!)
    .filter((n) => valides.has(String(n.proprietes.obligation_id ?? "")));
  if (noeuds.length) {
    const { error } = await admin
      .from("graphe_noeuds")
      .upsert(
        noeuds.map((n) => ({ id: n.id, type: "Clause", libelle: n.libelle, proprietes: n.proprietes as Json, contrat_id: contrat.id, regle_id: null })) as never,
        { onConflict: "id" },
      );
    if (error) throw new Error(`graphe_noeuds : ${error.message}`);
  }

  let aretes = 0;
  const elements = [...new Set(noeuds.map((n) => n.proprietes.element).filter((x): x is string => typeof x === "string" && !!x))];
  if (elements.length) {
    const { data: regles } = await admin.from("regles_en_vigueur").select("id, code, version, element").in("element", elements);
    const ids = (regles ?? []).map((r) => r.id).filter((x): x is string => !!x);
    const { data: cibles } = ids.length
      ? await admin.from("graphe_noeuds").select("id, regle_id").eq("type", "Regle").in("regle_id", ids)
      : { data: [] as { id: string; regle_id: string | null }[] };
    const rangees = noeuds.flatMap((n) =>
      (regles ?? [])
        .filter((r) => r.element === n.proprietes.element)
        .flatMap((r) =>
          (cibles ?? [])
            .filter((c) => c.regle_id === r.id)
            .map((c) => ({
              source_id: n.id,
              cible_id: c.id,
              relation: "IMPOSE",
              proprietes: { clause: n.proprietes.clause ?? null, page: n.proprietes.page ?? null, code_regle: r.code, version_regle: r.version } as Json,
            })),
        ),
    );
    if (rangees.length) {
      const { error } = await admin.from("graphe_aretes").upsert(rangees as never, { onConflict: "source_id,cible_id,relation" });
      if (error) throw new Error(`graphe_aretes : ${error.message}`);
      aretes = rangees.length;
    }
  }

  const maj: Record<string, unknown> = { statut_extraction: "termine", extrait_le: new Date().toISOString() };
  if (e.assureur?.trim()) maj.assureur = e.assureur.trim();
  if (e.formule?.trim()) maj.formule = e.formule.trim();
  if (e.reference_cg?.trim()) maj.reference_cg = e.reference_cg.trim();
  const { error: errC } = await admin.from("contrats").update(maj as never).eq("id", contrat.id);
  if (errC) throw new Error(`contrats : ${errC.message}`);

  // Embeddings des nouvelles clauses (GraphRAG), sans bloquer si Hugging Face ne répond pas.
  await completerEmbeddings(admin, contrat.id).catch(() => 0);

  return { obligations: lignes.length, rejetees, noeuds: noeuds.length, aretes };
}
