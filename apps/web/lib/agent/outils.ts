import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppelOutilHai, ResultatOutilHai } from "@/lib/hai";
import {
  demanderValidationEntreeSchema,
  getContratEntreeSchema,
  getMesuresEntreeSchema,
  getMesuresSortieSchema,
  type GetMesuresSortie,
} from "@/lib/schemas";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/** Le run auquel appartient l'appel : seule source du logement et de l'action. */
export type RunPourOutils = { session_id: string; logement_id: string; action_id: string | null };

/**
 * Contraintes CONCRÈTES sur le produit, déduites côté serveur du profil des occupants.
 * Les capacités sont des données de santé (RGPD art. 9) : rien de ce qui décrit une personne
 * (âge, canne, niveau de déplacement, vue, vigilance, prénom) ne part chez H. Seule la
 * conséquence sur le produit est envoyée (relecture de Briac, PR #9).
 */
export function contraintesProfil(
  occupants: { deplacement: number; vue_reduite: boolean; vigilance: string }[],
): string[] {
  const contraintes = ["Ne dépasse pas des dimensions données, sauf si la fiche dit qu'il se découpe."];
  const mobiliteReduite = occupants.some((o) => o.deplacement >= 1);
  const vigilance = occupants.some((o) => o.vue_reduite || o.vigilance !== "adulte");
  if (mobiliteReduite || vigilance) {
    contraintes.push("Fin, sans surépaisseur ni bord qui rebique : rien qui accroche le pied ou une aide à la marche.");
    contraintes.push("Antidérapant, adapté à un sol dur.");
  }
  if (vigilance) contraintes.push("Bien visible ou sans relief à contourner ; aucune petite pièce détachable.");
  return contraintes;
}

/**
 * get_mesures : cotes de la faille et contraintes du profil. La faille doit appartenir au
 * logement du run (l'agent ne choisit pas un autre logement). Contrat d'interface depuis la
 * PR #46 : `longueur_cm` (longueur au sol, `failles.longueur_cm`) et `hauteur_cm` (porte,
 * fenêtre, épaisseur d'un tapis) sont optionnels et absents quand ils sont inconnus.
 */
async function getMesures(admin: Admin, run: RunPourOutils, args: unknown): Promise<GetMesuresSortie> {
  const { faille_id } = getMesuresEntreeSchema.parse(args);
  const { data: faille } = await admin
    .from("failles")
    .select("element, piece, cote_confirmee_cm, largeur_cm, hauteur_cm, longueur_cm, logement_id")
    .eq("id", faille_id)
    .maybeSingle();
  if (!faille || faille.logement_id !== run.logement_id) {
    throw new Error(`Faille inconnue : ${faille_id}. Utilise le faille_id de la consigne.`);
  }
  if (faille.cote_confirmee_cm === null) throw new Error("La cote de cette faille n'est pas encore confirmée.");
  const { data: occupants } = await admin
    .from("occupants")
    .select("deplacement, vue_reduite, vigilance")
    .eq("logement_id", run.logement_id);
  return getMesuresSortieSchema.parse({
    element: faille.element,
    piece: faille.piece ?? "",
    cote_confirmee_cm: faille.cote_confirmee_cm,
    largeur_cm: faille.largeur_cm ?? faille.cote_confirmee_cm,
    hauteur_cm: faille.hauteur_cm ?? undefined,
    longueur_cm: faille.longueur_cm ?? undefined,
    contraintes_profil: contraintesProfil(occupants ?? []),
  });
}

/** get_contrat : seulement les champs demandés, par la RPC serveur (jamais le PDF ni l'adresse). */
async function getContrat(admin: Admin, run: RunPourOutils, args: unknown): Promise<unknown> {
  const { champs } = getContratEntreeSchema.parse(args);
  const { data, error } = await admin.rpc("get_contrat_champs", {
    p_logement_id: run.logement_id,
    p_champs: ["assureur", "formule", ...champs],
  });
  if (error) throw new Error("Contrat illisible pour ce logement.");
  if (!data) throw new Error("Aucun contrat pour ce logement.");
  return data;
}

/**
 * demander_validation : enregistre la demande (idempotent : `unique (session_id, call_id)`) et
 * ne répond PAS à H. La réponse part seulement après le clic de l'utilisateur
 * (`POST /api/agent/tools` → `repondreValidation`).
 */
async function enregistrerValidation(admin: Admin, run: RunPourOutils, appel: AppelOutilHai): Promise<void> {
  const demande = demanderValidationEntreeSchema.parse(appel.args ?? {});
  if (!run.action_id) throw new Error("Run sans action : validation impossible.");
  await admin.from("validations").upsert(
    {
      action_id: run.action_id,
      session_id: run.session_id,
      call_id: appel.id ?? `${appel.tool_name}:${JSON.stringify(appel.args ?? {})}`,
      resume: [demande.resume, demande.produit, demande.montant_eur !== undefined ? `${demande.montant_eur} €` : null, demande.url]
        .filter(Boolean)
        .join(" · "),
    },
    { onConflict: "session_id,call_id", ignoreDuplicates: true },
  );
}

/**
 * Traite les appels en attente d'une session. Renvoie les résultats à envoyer tout de suite
 * (get_mesures, get_contrat, outils inconnus en erreur) ; demander_validation est mis en
 * attente de l'utilisateur. Une exception devient une erreur visible par l'agent.
 */
export async function traiterAppels(admin: Admin, run: RunPourOutils, appels: AppelOutilHai[]): Promise<{
  resultats: ResultatOutilHai[];
  validationsEnAttente: number;
}> {
  const resultats: ResultatOutilHai[] = [];
  let validationsEnAttente = 0;
  for (const appel of appels) {
    try {
      if (appel.tool_name === "demander_validation") {
        await enregistrerValidation(admin, run, appel);
        validationsEnAttente += 1;
        continue;
      }
      const executer = appel.tool_name === "get_mesures" ? getMesures : appel.tool_name === "get_contrat" ? getContrat : null;
      if (!executer) throw new Error(`Outil inconnu : ${appel.tool_name}.`);
      resultats.push({ kind: "tool_result", tool_req: appel, result: await executer(admin, run, appel.args ?? {}) });
    } catch (erreur) {
      resultats.push({
        kind: "error_event",
        error: erreur instanceof Error ? erreur.message : "Erreur de l'outil.",
        origin: "custom_tools",
        tool_req: appel,
      });
    }
  }
  return { resultats, validationsEnAttente };
}
