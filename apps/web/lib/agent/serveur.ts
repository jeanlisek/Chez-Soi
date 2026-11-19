import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  detecterPageInterdite,
  horsCheminsAutorises,
  lireEvenement,
  MOTIFS_INTERDITS_PAR_DEFAUT,
  nettoyerUrl,
} from "../../../../agents/dev/boucle";
import { estEtatTerminal, outcomeConnu, type ClientHai } from "@/lib/hai";
import type { Database, Json } from "@/lib/supabase/types";

import { ErreurRoute } from "./erreurs";
import { traiterAppels } from "./outils";
import { definitionUsage, type ActionRun } from "./usages";

export { ErreurRoute };

type Admin = SupabaseClient<Database>;
type Utilisateur = SupabaseClient<Database>;

function sansRequete(texte: string): string {
  try {
    const url = new URL(texte);
    return `${url.origin}${url.pathname}`;
  } catch {
    return texte;
  }
}

/* ---------- Création d'un run ---------- */

const CONTRE_MESURE_ABSENCE = "Préparer l'Opération tranquillité vacances et l'information de l'assureur";

/**
 * Action de l'usage 3, rattachée à la dernière absence du logement : réutilisée si elle existe déjà
 * (un run relancé ne crée pas de doublon), sinon créée. Sans absence, même refus que `preparer`.
 */
async function actionDeLAbsence(admin: Admin, logementId: string): Promise<NonNullable<ActionRun>> {
  const { data: absence } = await admin
    .from("absences")
    .select("id")
    .eq("logement_id", logementId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!absence) throw new ErreurRoute(409, "Aucune absence enregistrée pour ce logement : indiquez d'abord les dates.");
  const { data: existante } = await admin
    .from("actions")
    .select("id")
    .eq("absence_id", absence.id)
    .eq("usage", 3)
    .limit(1)
    .maybeSingle();
  if (existante) return { id: existante.id, faille_id: null, absence_id: absence.id };
  const { data: creee, error } = await admin
    .from("actions")
    .insert({ absence_id: absence.id, usage: 3, contre_mesure: CONTRE_MESURE_ABSENCE })
    .select("id")
    .single();
  if (error || !creee) throw new ErreurRoute(500, "Impossible de rattacher l'absence à une action.");
  return { id: creee.id, faille_id: null, absence_id: absence.id };
}

/**
 * Crée une session H pour le logement de l'utilisateur. Vérifie, dans l'ordre : l'usage, le
 * logement (RLS : l'utilisateur ne voit que le sien), l'action quand l'usage en exige une
 * (faille pour l'usage 2, absence pour l'usage 3, aucune pour l'usage 1), puis le quota de
 * l'organisation (`queue: false` : jamais de session qui démarre seule plus tard). Écrit la
 * ligne `runs_agent` dès la création, avant tout webhook.
 */
export async function creerRun(params: {
  utilisateur: Utilisateur;
  admin: Admin;
  hai: ClientHai;
  logementId: string;
  usage: number;
  actionId: string | null;
}): Promise<{ session_id: string; run_id: string; agent: string }> {
  const { utilisateur, admin, hai, logementId, usage, actionId } = params;
  const definition = definitionUsage(usage);
  if (!definition) throw new ErreurRoute(501, `Usage ${usage} pas encore branché (arrive avec sa PR).`);

  const { data: logement } = await utilisateur.from("logements").select("id").eq("id", logementId).maybeSingle();
  if (!logement) throw new ErreurRoute(404, "Logement introuvable.");

  let action: ActionRun = null;
  if (definition.action) {
    if (!actionId) throw new ErreurRoute(400, "Action requise pour cet usage.");
    const { data } = await admin
      .from("actions")
      .select("id, faille_id, absence_id, failles(logement_id), absences(logement_id)")
      .eq("id", actionId)
      .maybeSingle();
    const origine = (definition.action === "faille" ? data?.failles : data?.absences) as { logement_id?: string } | null;
    if (!data || origine?.logement_id !== logementId) throw new ErreurRoute(404, "Action introuvable pour ce logement.");
    action = { id: data.id, faille_id: data.faille_id, absence_id: data.absence_id };
  } else if (definition.usage === 3) {
    // `validations.action_id` est obligatoire : sans action, `demander_validation` (action « envoi »)
    // échouait et l'agent finissait sans validation (run du 19/11). L'action vient de la dernière absence.
    action = await actionDeLAbsence(admin, logementId);
  }
  const preparation = await definition.preparer(admin, logementId, action);

  const quota = await hai.lireQuota();
  if (quota.active >= quota.limit) {
    throw new ErreurRoute(429, "Toutes les sessions H de l'équipe sont occupées : réessayez dans quelques minutes.");
  }

  const session = await hai.creerSession({
    agent: definition.agent,
    messages: preparation.consigne,
    formatReponse: definition.formatReponse,
    urlDepart: preparation.urlDepart,
    maxTimeS: 600,
    fileAttente: false,
    timezone: "Europe/Paris",
    cleIdempotence: randomUUID(),
  });

  const { data: run, error } = await admin
    .from("runs_agent")
    .insert({
      session_id: session.id,
      usage: definition.usage,
      agent: definition.agent,
      site: preparation.site,
      logement_id: logementId,
      action_id: action?.id ?? null,
      statut_final: session.status.status,
      agent_revision: session.agent_revision ?? null,
      debut: session.created_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !run) {
    // La session existe chez H mais pas chez nous : on l'annule plutôt que de la laisser orpheline.
    await hai.annulerSession(session.id).catch(() => undefined);
    throw new ErreurRoute(500, "Run non enregistré : session annulée.");
  }
  if (action) await admin.from("actions").update({ statut: "en_cours" }).eq("id", action.id);
  return { session_id: session.id, run_id: run.id, agent: definition.agent };
}

/* ---------- Traitement d'une session (déclenché par webhook) ---------- */

/**
 * Lit l'état complet d'une session par `/changes` (une seule lecture, depuis le début) puis :
 *  1. coupe-circuit : page de commande, paiement, connexion… vue ou visée → annulation ;
 *  2. outils : get_mesures et get_contrat répondus tout de suite, demander_validation mis en
 *     attente du clic ;
 *  3. fin de session : réponse évaluée (schéma Zod + écarts métier) et `runs_agent` complété.
 * Idempotent : peut être appelé plusieurs fois pour la même session (livraisons répétées).
 */
export async function traiterSession(admin: Admin, hai: ClientHai, sessionId: string): Promise<string> {
  const { data: run } = await admin
    .from("runs_agent")
    .select("session_id, usage, logement_id, action_id, coupe_circuit, statut_final")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!run) return "session inconnue de Chez Soi : ignorée";
  if (run.statut_final && estEtatTerminal(run.statut_final)) return "run déjà terminé";
  const definition = definitionUsage(run.usage);

  const changements = await hai.lireChangements(sessionId, { depuis: 0 });
  if (!changements) return "rien de neuf";

  // 1. Coupe-circuit.
  const outilsMaison = new Set(["get_mesures", "get_contrat", "demander_validation"]);
  const pages = new Set<string>();
  const actions: Record<string, number> = {};
  let coupe: { motif: string; source: string; url: string } | null = null;
  const motifs = {
    stricts: [
      ...MOTIFS_INTERDITS_PAR_DEFAUT.stricts.filter((m) => !definition?.motifsEnMoins?.includes(m)),
      ...(definition?.motifsEnPlus ?? []),
    ],
    tunnel: MOTIFS_INTERDITS_PAR_DEFAUT.tunnel,
  };
  for (const evenement of changements.new_events) {
    const lecture = lireEvenement(evenement, outilsMaison);
    lecture.actions.forEach((nom) => (actions[nom] = (actions[nom] ?? 0) + 1));
    for (const { url, source } of lecture.urls) {
      if (source === "page") pages.add(sansRequete(url));
      const motif: string | null = coupe
        ? null
        : (detecterPageInterdite(url, motifs) ??
          (definition?.cheminsAutorises ? horsCheminsAutorises(url, definition.cheminsAutorises) : null));
      if (motif) coupe = { motif, source, url: nettoyerUrl(url) };
    }
  }
  // Le coupe-circuit est écrit AVANT l'annulation : si H ne répond pas, le run reste marqué
  // et l'annulation est retentée au prochain webhook ou au prochain GET (lireRun). Tant que
  // la session n'est pas terminale, on ne répond plus à aucun outil (relecture de Briac, #40).
  // Une page interdite vue par une session déjà terminée est enregistrée aussi, pour l'audit.
  const dejaCoupe = Boolean(run.coupe_circuit);
  if (coupe && !dejaCoupe) {
    await admin
      .from("runs_agent")
      .update({ coupe_circuit: coupe as Json, motif_fin: "coupe_circuit" })
      .eq("session_id", sessionId);
  }
  if ((coupe || dejaCoupe) && !estEtatTerminal(changements.status)) {
    try {
      await hai.annulerSession(sessionId);
      await admin.from("runs_agent").update({ annulee_par_script: true }).eq("session_id", sessionId);
    } catch (erreur) {
      console.error("[agent] annulation après coupe-circuit impossible, nouvel essai au prochain appel", sessionId, erreur);
      return "coupe-circuit : annulation à retenter";
    }
    return `coupe-circuit : ${coupe?.motif ?? "session déjà coupée"}`;
  }

  // 2. Outils en attente.
  if (changements.status === "awaiting_tool_results" && changements.pending_tool_calls.length && run.logement_id) {
    const { resultats, validationsEnAttente } = await traiterAppels(
      admin,
      { session_id: sessionId, logement_id: run.logement_id, action_id: run.action_id },
      changements.pending_tool_calls,
    );
    if (resultats.length) await hai.envoyerResultatsOutils(sessionId, resultats);
    return `${resultats.length} outil(s) répondu(s), ${validationsEnAttente} validation(s) en attente`;
  }

  // 3. Fin de session.
  if (estEtatTerminal(changements.status)) {
    const runUsage = { session_id: sessionId, logement_id: run.logement_id ?? "", action_id: run.action_id };
    // Une évaluation qui échoue (contrat retiré entre-temps…) ne doit pas empêcher de clore le run.
    const evaluation =
      definition && run.logement_id ? await definition.evaluer(admin, runUsage, changements.answer).catch(() => null) : null;
    const enPlus =
      definition?.apresFin && evaluation ? await definition.apresFin(admin, runUsage, evaluation).catch(() => ({})) : {};
    await admin
      .from("runs_agent")
      .update({
        statut_final: changements.status,
        outcome: outcomeConnu(changements.outcome),
        error_code: changements.error_code ?? null,
        erreur: changements.error ?? null,
        fin: changements.finished_at ?? new Date().toISOString(),
        nb_etapes: changements.metrics?.steps ?? null,
        cout_usd: changements.metrics?.total_cost ?? null,
        motif_fin: coupe || dejaCoupe ? "coupe_circuit" : "terminee",
        sortie_finale: (evaluation?.brut ?? changements.answer ?? null) as Json,
        schema_valide: evaluation?.schema_valide ?? null,
        erreurs_schema: evaluation?.erreurs_schema ?? null,
        ecarts_metier: evaluation?.ecarts_metier ?? null,
        pages_vues: [...pages],
        actions_agent: actions as Json,
        ...enPlus,
      })
      .eq("session_id", sessionId);
    if (run.action_id) await admin.from("actions").update({ statut: "proposee" }).eq("id", run.action_id);
    return `run terminé (${changements.status})`;
  }

  await admin.from("runs_agent").update({ statut_final: changements.status, pages_vues: [...pages] }).eq("session_id", sessionId);
  return `état ${changements.status}`;
}

/* ---------- Réponse de l'utilisateur à demander_validation ---------- */

/**
 * Le clic dans ValidationModal. La validation doit appartenir à l'utilisateur (RLS), être
 * encore sans décision, et l'appel doit être encore en attente chez H : on renvoie alors le
 * `tool_req` reçu, tel quel. Quelle que soit la décision, l'agent a pour consigne de ne plus
 * agir dans le navigateur : « approuve » ne commande rien.
 */
export async function repondreValidation(params: {
  utilisateur: Utilisateur;
  admin: Admin;
  hai: ClientHai;
  validationId: string;
  decision: "approuve" | "refuse" | "modifier";
  message?: string;
}): Promise<void> {
  const { utilisateur, admin, hai, validationId, decision, message } = params;
  const { data: validation } = await utilisateur
    .from("validations")
    .select("id, session_id, call_id, decision")
    .eq("id", validationId)
    .maybeSingle();
  if (!validation) throw new ErreurRoute(404, "Validation introuvable.");
  if (validation.decision) throw new ErreurRoute(409, "Cette validation a déjà une réponse.");

  // Le navigateur a pu agir dans la même étape que l'appel d'outil : on relit la session
  // (coupe-circuit compris) avant de répondre, et on ne répond pas à une session coupée.
  await traiterSession(admin, hai, validation.session_id);
  const { data: apres } = await admin.from("runs_agent").select("coupe_circuit").eq("session_id", validation.session_id).maybeSingle();
  if (apres?.coupe_circuit) throw new ErreurRoute(409, "La session a été coupée (page interdite) : rien n'est validé.");

  const appels = await hai.lireAppelsEnAttente(validation.session_id);
  const appel = appels.find(
    (a) => a.tool_name === "demander_validation" && (a.id ?? `${a.tool_name}:${JSON.stringify(a.args ?? {})}`) === validation.call_id,
  );
  if (!appel) throw new ErreurRoute(409, "L'agent n'attend plus cette validation.");

  const consigne =
    decision === "approuve"
      ? "Validation enregistrée. Ta mission s'arrête ici : ne fais plus aucune action dans le navigateur, n'ouvre pas le tunnel de commande, et rends ta réponse finale maintenant."
      : decision === "modifier"
        ? `L'utilisateur demande une modification : « ${message ?? ""} ». Ne commande rien.`
        : "Refusé par l'utilisateur. Ne fais plus aucune action dans le navigateur, ne commande rien, et rends ta réponse finale maintenant.";
  await hai.envoyerResultatsOutils(validation.session_id, [
    { kind: "tool_result", tool_req: appel, result: { decision, message: consigne } },
  ]);
  await admin
    .from("validations")
    .update({ decision, decide_le: new Date().toISOString() })
    .eq("id", validationId);
  await admin.from("runs_agent").update({ decision_validation: decision }).eq("session_id", validation.session_id);
}

/* ---------- Pilotage ---------- */

/** Consigne de l'utilisateur à une session en cours, journalisée dans `messages_agent`. */
export async function envoyerConsigne(params: {
  utilisateur: Utilisateur;
  admin: Admin;
  hai: ClientHai;
  sessionId: string;
  contenu: string;
}): Promise<{ message_id: string }> {
  const { utilisateur, admin, hai, sessionId, contenu } = params;
  const { data: run } = await utilisateur.from("runs_agent").select("session_id, statut_final").eq("session_id", sessionId).maybeSingle();
  if (!run) throw new ErreurRoute(404, "Session introuvable.");
  if (run.statut_final && estEtatTerminal(run.statut_final)) {
    // Un message relancerait la session terminée, et la referait facturer.
    throw new ErreurRoute(409, "La session est terminée : la consigne n'est pas envoyée.");
  }
  const { data: ligne, error } = await admin
    .from("messages_agent")
    .insert({ session_id: sessionId, contenu, auteur: "utilisateur" })
    .select("id")
    .single();
  if (error || !ligne) throw new ErreurRoute(500, "Consigne non enregistrée.");
  try {
    await hai.envoyerMessage(sessionId, contenu);
    await admin.from("messages_agent").update({ statut_envoi: "envoye", envoye_le: new Date().toISOString() }).eq("id", ligne.id);
  } catch (erreur) {
    await admin
      .from("messages_agent")
      .update({ statut_envoi: "echec", erreur: erreur instanceof Error ? erreur.message.slice(0, 500) : "échec" })
      .eq("id", ligne.id);
    throw new ErreurRoute(502, "La consigne n'a pas pu être transmise à l'agent.");
  }
  return { message_id: ligne.id };
}

/* ---------- Lecture ---------- */

/**
 * État d'un run pour l'écran Agent : ligne `runs_agent` et validation en attente (RLS).
 * Chaque lecture relit aussi la session chez H (`traiterSession`) : pendant l'attente du clic
 * sur `demander_validation`, aucun webhook n'arrive, et c'est ce suivi qui garde le
 * coupe-circuit actif tant que l'écran est ouvert.
 */
export async function lireRun(utilisateur: Utilisateur, sessionId: string, admin?: Admin, hai?: ClientHai) {
  const lire = () =>
    utilisateur
      .from("runs_agent")
      .select(
        "session_id, usage, agent, statut_final, outcome, error_code, motif_fin, debut, fin, nb_etapes, sortie_finale, schema_valide, ecarts_metier, decision_validation, coupe_circuit",
      )
      .eq("session_id", sessionId)
      .maybeSingle();
  let { data: run } = await lire();
  if (!run) throw new ErreurRoute(404, "Session introuvable.");
  if (admin && hai && !(run.statut_final && estEtatTerminal(run.statut_final))) {
    await traiterSession(admin, hai, sessionId).catch(() => undefined);
    run = (await lire()).data ?? run;
  }
  const { data: validations } = await utilisateur
    .from("validations")
    .select("id, resume, decision, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  return { run, validation_en_attente: validations?.find((v) => !v.decision) ?? null };
}
