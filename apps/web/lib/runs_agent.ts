import type { RunAgent } from "./schemas";
import type { Json, TablesInsert } from "./supabase/types";

const NUMERO_USAGE = { u1: 1, u2: 2, u3: 3 } as const;

/**
 * Convertit un run (`runAgentSchema`) en ligne de la table `runs_agent`
 * (migrations 0001 et 0006). Deux différences de forme : `etat_final` s'écrit dans
 * `statut_final`, et `usage` s'écrit 1, 2 ou 3.
 *
 * `outcome` arrive déjà normalisé : une valeur que la colonne refuserait vaut `null`, la
 * valeur brute de H est dans `observations_api.outcome_brut`.
 *
 * Tous les champs du run sont repris un par un : si on en ajoute un à `runAgentSchema`
 * sans le placer ici, le typecheck échoue.
 */
export function versLigneRunsAgent(
  run: RunAgent,
  rattachement: { logement_id?: string; action_id?: string } = {},
): TablesInsert<"runs_agent"> {
  const {
    session_id,
    usage,
    agent,
    agent_revision,
    site,
    etat_final,
    outcome,
    error_code,
    erreur,
    motif_fin,
    annulee_par_script,
    coupe_circuit,
    debut,
    fin,
    duree_s,
    nb_etapes,
    tokens,
    cout_usd,
    decision_validation,
    appels_outils,
    sortie_finale,
    schema_valide,
    erreurs_schema,
    ecarts_metier,
    pages_vues,
    actions_agent,
    observations_api,
    // Usage 1 : pas encore de colonne dans `runs_agent` (migration 0008 prévue avec Briac,
    // `controle_document jsonb`). Retiré ici et NON écrit en base en attendant ; il reste
    // dans le fichier du run (`agents/bench/runs/`).
    controle_document: _controle_document_sans_colonne,
    ...reste
  } = run;
  void _controle_document_sans_colonne;
  const aucunChampOublie: Record<string, never> = reste;
  void aucunChampOublie;

  return {
    ...rattachement,
    session_id,
    usage: NUMERO_USAGE[usage],
    agent,
    agent_revision,
    site,
    statut_final: etat_final,
    outcome,
    error_code,
    erreur,
    motif_fin,
    annulee_par_script,
    coupe_circuit,
    debut,
    fin,
    duree_s,
    nb_etapes,
    tokens,
    cout_usd,
    decision_validation,
    appels_outils: appels_outils as Json,
    sortie_finale: sortie_finale as Json,
    schema_valide,
    erreurs_schema,
    ecarts_metier,
    pages_vues,
    actions_agent,
    observations_api,
  };
}
