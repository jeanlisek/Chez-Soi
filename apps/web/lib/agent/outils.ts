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

const NIVEAUX_DEPLACEMENT = [
  "se déplace sans difficulté",
  "se déplace avec une gêne légère",
  "se déplace avec une canne",
  "se déplace avec un déambulateur",
  "se déplace en fauteuil roulant",
];

/** Capacités fonctionnelles des occupants (RGPD art. 9 : pas de diagnostic), en phrases courtes. */
export function contraintesProfil(
  occupants: { libelle: string; deplacement: number; vue_reduite: boolean; audition_reduite: boolean; vigilance: string }[],
): string[] {
  return occupants.map((o) => {
    const elements = [`${o.libelle} : ${NIVEAUX_DEPLACEMENT[o.deplacement] ?? `déplacement ${o.deplacement} sur 4`}`];
    if (o.vue_reduite) elements.push("vue réduite");
    if (o.audition_reduite) elements.push("audition réduite");
    if (o.vigilance === "jeune_enfant") elements.push("jeune enfant");
    if (o.vigilance === "troubles_cognitifs") elements.push("vigilance réduite");
    return `${elements.join(", ")}.`;
  });
}

/**
 * get_mesures : cotes de la faille et contraintes du profil. La faille doit appartenir au
 * logement du run (l'agent ne choisit pas un autre logement). Pour un élément posé au sol,
 * le contrat d'interface n'a pas de `longueur_cm` : elle passe dans `hauteur_cm`.
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
    .select("libelle, deplacement, vue_reduite, audition_reduite, vigilance")
    .eq("logement_id", run.logement_id);
  return getMesuresSortieSchema.parse({
    element: faille.element,
    piece: faille.piece ?? "",
    cote_confirmee_cm: faille.cote_confirmee_cm,
    largeur_cm: faille.largeur_cm ?? faille.cote_confirmee_cm,
    hauteur_cm: faille.hauteur_cm ?? faille.longueur_cm ?? faille.cote_confirmee_cm,
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
