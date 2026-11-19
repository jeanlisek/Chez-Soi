import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Evaluation } from "../../../../agents/dev/controle";
import { controlerDocument } from "../../../../agents/dev/pdf_cg";
import type { ControleDocument, SortieUsage1 } from "@/lib/schemas";
import type { Database, Json } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/**
 * Fin de l'usage 1 (issue #7, flux 7 et 8 de la v3) : le code télécharge le PDF à l'URL de
 * l'agent (domaines officiels de l'assureur seulement, `assureurs.domaines`), vérifie lui-même
 * la référence, range le PDF dans le bucket privé `contrats` ({user_id}/{logement_id}/cg_…) et
 * renseigne les colonnes `cg_*` du contrat. On ne se fie ni à l'`outcome` ni à
 * `reference_trouvee`.
 *
 * La lecture des clauses des CG n'est pas lancée ici : `enregistrerExtraction` (`lib/contrat.ts`)
 * écrit `source: "cp"` et retire les clauses d'une lecture précédente du même contrat. Lire les CG
 * par ce chemin effacerait les clauses des conditions particulières. À brancher quand la lecture
 * saura distinguer `cg` et `cp`.
 */
export async function verifierCgUsage1(
  admin: Admin,
  run: { session_id: string; logement_id: string },
  evaluation: Evaluation<unknown>,
): Promise<Json | null> {
  const sortie = evaluation.sortie as SortieUsage1 | null;
  if (!sortie?.trouve || !sortie.url_cg) return null;

  const { data: contrat } = await admin
    .from("contrats")
    .select("id, reference_cg, assureurs(domaines), logements(user_id)")
    .eq("logement_id", run.logement_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const domaines = (contrat?.assureurs as { domaines: string[] } | null)?.domaines;
  const userId = (contrat?.logements as { user_id: string } | null)?.user_id;
  if (!contrat || !domaines || !userId || !contrat.reference_cg) return null;

  const controle: ControleDocument = await controlerDocument({
    url: sortie.url_cg,
    domaines,
    referenceAttendue: contrat.reference_cg,
    prefixe: "cg",
    enregistrer: async (pdf, sha256) => {
      const chemin = `${userId}/${run.logement_id}/cg_${sha256.slice(0, 12)}.pdf`;
      const { error } = await admin.storage.from("contrats").upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
      return error ? null : chemin;
    },
  });

  const verifie = controle.reference === "trouvee";
  await admin
    .from("contrats")
    .update({
      cg_url: controle.url_finale ?? controle.url,
      cg_path: controle.fichier_local,
      cg_reference_trouvee: verifie ? contrat.reference_cg : null,
      version_cg_verifiee: verifie,
      cg_date_version: sortie.date_version ?? null,
      fiche_information_url: sortie.url_fiche_information ?? null,
    })
    .eq("id", contrat.id);

  return controle as unknown as Json;
}
