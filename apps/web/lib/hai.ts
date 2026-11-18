import { z } from "zod";

/**
 * Client REST de l'Agents API de H Company (endpoint européen).
 *
 * De simples appels HTTP, sans SDK qui attend la session : chaque fonction fait un
 * appel et rend la main, pour être réutilisable par les routes Vercel comme par les
 * scripts locaux de `agents/dev/`. Rien de propre à un usage ici : le prompt, les
 * outils et le schéma de sortie sont passés en paramètres.
 *
 * Chaque fonction renvoie à la page de la doc qui décrit l'appel
 * (index : https://hub.hcompany.ai/llms.txt). Ne rien ajouter ici qui n'y figure pas.
 *
 * La clé est lue dans `H_API_KEY` (la doc H l'appelle `HAI_API_KEY`, convention de
 * son SDK). Elle n'est jamais écrite dans un message d'erreur ni dans un journal.
 */

export const HAI_BASE_URL = "https://agp.eu.hcompany.ai";
export const HAI_API_URL = `${HAI_BASE_URL}/api/v2`;
export const HAI_AGENT = "h/web-surfer-flash";

/* ---------- États, issues et codes d'erreur ---------- */

/** https://hub.hcompany.ai/agents-api/sessions/overview.md (Session states) */
export const ETATS_TERMINAUX = ["completed", "failed", "timed_out", "interrupted"] as const;
export const ETATS_SESSION = [
  "queued",
  "pending",
  "running",
  "paused",
  "idle",
  "awaiting_tool_results",
  ...ETATS_TERMINAUX,
] as const;

/** Auto-évaluation de l'agent, jamais une preuve. https://hub.hcompany.ai/agents-api/errors.md (Outcomes) */
export const OUTCOMES = ["success", "partial", "infeasible", "blocked"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * L'issue si elle fait partie des quatre valeurs de la doc, sinon `null`. La colonne
 * `runs_agent.outcome` n'accepte que ces quatre valeurs : une valeur inconnue de H ne doit
 * jamais faire échouer l'insertion. La valeur brute est à garder à part.
 */
export function outcomeConnu(valeur: string | null | undefined): Outcome | null {
  return (OUTCOMES as readonly string[]).includes(valeur ?? "") ? (valeur as Outcome) : null;
}

/** https://hub.hcompany.ai/agents-api/errors.md (Error codes). De nouveaux codes peuvent apparaître. */
export const CODES_ERREUR = [
  "environment_error",
  "no_answer",
  "answer_validation",
  "timeout",
  "insufficient_credit",
  "internal",
] as const;

export function estEtatTerminal(etat: string): boolean {
  return (ETATS_TERMINAUX as readonly string[]).includes(etat);
}

/* ---------- Schémas des objets de l'API ---------- */

/**
 * Déclaration d'un custom tool : exactement `{ name, description, input_schema }`.
 * https://hub.hcompany.ai/agents-api/custom-tools.md (Declare the tools at session create)
 * https://hub.hcompany.ai/agents-api/agents/create.md (tools)
 */
export const outilHaiSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,64}$/, "lettres, chiffres et tirets bas, 64 caractères au plus"),
  description: z.string().min(1),
  input_schema: z.record(z.string(), z.unknown()),
});
export type OutilHai = z.infer<typeof outilHaiSchema>;

/**
 * Appel d'outil en attente, à renvoyer tel quel dans `tool_req`.
 * `id` peut être `null` (doc de `status`) : prévoir une clé de repli côté appelant.
 * https://hub.hcompany.ai/agents-api/sessions/status.md (pending_tool_calls)
 */
export const appelOutilHaiSchema = z.looseObject({
  tool_name: z.string(),
  args: z.record(z.string(), z.unknown()).nullish(),
  id: z.string().nullish(),
});
export type AppelOutilHai = z.infer<typeof appelOutilHaiSchema>;

const usageModeleSchema = z.looseObject({
  name: z.string(),
  input_tokens: z.number().default(0),
  cached_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  reasoning_tokens: z.number().default(0),
});

/** https://hub.hcompany.ai/agents-api/sessions/status.md (Response) */
export const etatSessionSchema = z.looseObject({
  status: z.string(),
  error: z.string().nullish(),
  error_code: z.string().nullish(),
  outcome: z.string().nullish(),
  steps: z.number().default(0),
  usage_per_model: z.array(usageModeleSchema).default([]),
  subagent_session_ids: z.array(z.string()).default([]),
  pending_tool_calls: z.array(appelOutilHaiSchema).default([]),
  pending_approvals: z.array(z.unknown()).default([]),
});
export type EtatSession = z.infer<typeof etatSessionSchema>;

/** https://hub.hcompany.ai/agents-api/sessions/retrieve.md (Response) */
export const sessionSchema = z.looseObject({
  id: z.string(),
  status: etatSessionSchema,
  agent_revision: z.number().nullish(),
  agent_view_url: z.string().nullish(),
  latest_answer: z.unknown(),
  created_at: z.string().nullish(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
});
export type Session = z.infer<typeof sessionSchema>;

/** https://hub.hcompany.ai/agents-api/sessions/event-object.md */
export const evenementSchema = z.looseObject({
  type: z.string(),
  data: z.record(z.string(), z.unknown()).nullish(),
  timestamp: z.string().nullish(),
});
export type EvenementHai = z.infer<typeof evenementSchema>;

/** https://hub.hcompany.ai/agents-api/sessions/changes.md (Response) */
export const changementsSchema = z.looseObject({
  status: z.string(),
  started_at: z.string().nullish(),
  finished_at: z.string().nullish(),
  error: z.string().nullish(),
  error_code: z.string().nullish(),
  outcome: z.string().nullish(),
  answer: z.unknown(),
  metrics: z
    .looseObject({
      steps: z.number().nullish(),
      total_cost: z.number().nullish(),
    })
    .nullish(),
  new_events: z.array(evenementSchema).default([]),
  first_index: z.number().nullish(),
  pending_tool_calls: z.array(appelOutilHaiSchema).default([]),
  pending_approvals: z.array(z.unknown()).default([]),
});
export type Changements = z.infer<typeof changementsSchema>;

/** https://hub.hcompany.ai/agents-api/sessions/quota.md (Response) */
export const quotaSchema = z.looseObject({
  scope: z.string(),
  limit: z.number(),
  active: z.number(),
  available: z.number(),
});
export type Quota = z.infer<typeof quotaSchema>;

/**
 * Résultat d'un appel d'outil : succès (`tool_result`) ou échec (`error_event`).
 * https://hub.hcompany.ai/agents-api/sessions/tool-results.md (Request body)
 */
export type ResultatOutilHai =
  | { kind: "tool_result"; tool_req: AppelOutilHai; result: unknown }
  | { kind: "error_event"; error: string; origin: string; tool_req: AppelOutilHai };

/* ---------- Erreurs ---------- */

/**
 * Réponse non 2xx de l'API. Enveloppe `{ message, detail[] }`.
 * https://hub.hcompany.ai/agents-api/errors.md (Error envelope)
 */
export class HaiErreur extends Error {
  readonly statut: number;
  readonly detail: unknown;
  readonly retryAfterS: number | null;

  constructor(statut: number, message: string, detail: unknown, retryAfterS: number | null) {
    super(`H Agents API ${statut} : ${message}`);
    this.name = "HaiErreur";
    this.statut = statut;
    this.detail = detail;
    this.retryAfterS = retryAfterS;
  }

  /** `detail[].type`, par exemple `plan_limit`, `capacity`, `session_stopping`. */
  get types(): string[] {
    if (!Array.isArray(this.detail)) return [];
    return this.detail.flatMap((d) =>
      d && typeof d === "object" && typeof (d as { type?: unknown }).type === "string"
        ? [(d as { type: string }).type]
        : [],
    );
  }
}

/* ---------- Client ---------- */

export type OptionsClientHai = {
  /** Par défaut : `process.env.H_API_KEY`, lue à chaque appel. */
  cleApi?: string;
  /** Par défaut : endpoint européen. */
  apiUrl?: string;
  /** Délai d'un appel, en millisecondes (30 s par défaut). */
  delaiMs?: number;
  /** Nouvelles tentatives sur erreur transitoire (2 par défaut, comme les SDK). */
  tentatives?: number;
  fetch?: typeof fetch;
};

export type CreerSessionParams = {
  /** Identifiant du catalogue, par exemple `h/web-surfer-flash`, ou `nom:N` pour figer une révision. */
  agent: string;
  /** La tâche, en une consigne. */
  messages: string;
  /** Custom tools : envoyés dans `overrides["agent.tools"]`. */
  outils?: OutilHai[];
  /** JSON Schema de la réponse finale : envoyé dans `overrides["agent.answer_format"]`. */
  formatReponse?: Record<string, unknown>;
  /** Page de départ du navigateur : `overrides["agent.environments[kind=web].start_url"]`. */
  urlDepart?: string;
  /** Autres surcharges, par chemin (prioritaires sur les trois précédentes). */
  overrides?: Record<string, unknown>;
  /** Plafond de temps par réponse, en secondes (`max_time_s`). */
  maxTimeS?: number;
  /** Plafond d'étapes (`max_steps`). */
  maxSteps?: number;
  /** `queue`. Faux par défaut ici : à la limite de sessions, on veut un 429, pas une session qui démarre seule plus tard. */
  fileAttente?: boolean;
  /** Fuseau IANA, par exemple `Europe/Paris`. */
  timezone?: string;
  /** En-tête `Idempotency-Key` : une nouvelle tentative avec la même clé rend la même session. */
  cleIdempotence?: string;
};

type OptionsRequete = {
  corps?: unknown;
  entetes?: Record<string, string>;
  delaiMs?: number;
  /** Faux pour la création : un 429 y signifie « plus de place », on ne relance pas. */
  reessayer429?: boolean;
  /** Vrai pour les appels sans effet de bord en double (GET, DELETE, création avec clé d'idempotence). */
  reessayer5xx?: boolean;
};

const attendre = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function creerClientHai(options: OptionsClientHai = {}) {
  const apiUrl = options.apiUrl ?? HAI_API_URL;
  const delaiParDefautMs = options.delaiMs ?? 30_000;
  const tentativesMax = options.tentatives ?? 2;
  const appelFetch = options.fetch ?? fetch;

  function cle(): string {
    const valeur = options.cleApi ?? process.env.H_API_KEY;
    if (!valeur) {
      throw new Error("H_API_KEY est absente de l'environnement.");
    }
    return valeur;
  }

  /**
   * Politique de nouvelle tentative : celle de la doc (408 et 429 partout, 5xx sur les
   * appels rejouables), en respectant `Retry-After`.
   * https://hub.hcompany.ai/agents-api/errors.md (Handle errors in code)
   */
  async function requete(methode: string, chemin: string, opts: OptionsRequete = {}): Promise<Response> {
    const { corps, entetes, delaiMs = delaiParDefautMs, reessayer429 = true, reessayer5xx = false } = opts;
    let derniereErreur: unknown;

    for (let tentative = 0; tentative <= tentativesMax; tentative++) {
      let reponse: Response;
      try {
        reponse = await appelFetch(`${apiUrl}${chemin}`, {
          method: methode,
          headers: {
            Authorization: `Bearer ${cle()}`,
            ...(corps === undefined ? {} : { "Content-Type": "application/json" }),
            ...entetes,
          },
          body: corps === undefined ? undefined : JSON.stringify(corps),
          signal: AbortSignal.timeout(delaiMs),
        });
      } catch (erreur) {
        // Erreur réseau ou délai dépassé : on ne rejoue que les appels rejouables.
        derniereErreur = erreur;
        if (!reessayer5xx || tentative === tentativesMax) break;
        await attendre(1000 * 2 ** tentative);
        continue;
      }

      if (reponse.ok) return reponse;

      const retryAfter = Number(reponse.headers.get("retry-after"));
      const retryAfterS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      const rejouable =
        reponse.status === 408 ||
        (reponse.status === 429 && reessayer429) ||
        (reponse.status >= 500 && reessayer5xx);

      if (rejouable && tentative < tentativesMax) {
        await reponse.body?.cancel().catch(() => undefined);
        await attendre(Math.min(retryAfterS ?? 2 ** tentative, 30) * 1000);
        continue;
      }

      const texte = await reponse.text().catch(() => "");
      let message = texte.slice(0, 500) || reponse.statusText;
      let detail: unknown = null;
      try {
        const enveloppe = JSON.parse(texte) as { message?: unknown; detail?: unknown };
        if (typeof enveloppe.message === "string") message = enveloppe.message;
        else if (typeof enveloppe.detail === "string") message = enveloppe.detail;
        detail = enveloppe.detail ?? null;
      } catch {
        // Corps non JSON : on garde le texte tronqué.
      }
      throw new HaiErreur(reponse.status, message, detail, retryAfterS);
    }

    const cause = derniereErreur instanceof Error ? derniereErreur.message : String(derniereErreur);
    throw new Error(`H Agents API injoignable (${methode} ${chemin}) : ${cause}`);
  }

  /**
   * Construit le corps de `POST /sessions` sans l'envoyer (utile pour un essai à blanc).
   * https://hub.hcompany.ai/agents-api/sessions/create.md (Request body, overrides)
   */
  function corpsCreation(params: CreerSessionParams): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};
    if (params.outils?.length) {
      overrides["agent.tools"] = params.outils.map((outil) => outilHaiSchema.parse(outil));
    }
    if (params.formatReponse) overrides["agent.answer_format"] = params.formatReponse;
    if (params.urlDepart) overrides["agent.environments[kind=web].start_url"] = params.urlDepart;
    Object.assign(overrides, params.overrides);

    return {
      agent: params.agent,
      messages: params.messages,
      queue: params.fileAttente ?? false,
      ...(params.maxTimeS === undefined ? {} : { max_time_s: params.maxTimeS }),
      ...(params.maxSteps === undefined ? {} : { max_steps: params.maxSteps }),
      ...(params.timezone === undefined ? {} : { timezone: params.timezone }),
      ...(Object.keys(overrides).length ? { overrides } : {}),
    };
  }

  /**
   * Lit l'état : `GET /sessions/{id}/status`. État, `outcome`, `error_code`, étapes,
   * tokens et `pending_tool_calls`. Ne porte jamais la réponse finale.
   * https://hub.hcompany.ai/agents-api/sessions/status.md
   */
  async function lireEtat(sessionId: string): Promise<EtatSession> {
    const reponse = await requete("GET", `/sessions/${encodeURIComponent(sessionId)}/status`, {
      reessayer5xx: true,
    });
    return etatSessionSchema.parse(await reponse.json());
  }

  return {
    corpsCreation,

    /**
     * Crée une session : `POST /sessions`, réponse 201 avec l'objet session
     * (`pending`, ou `queued` si `fileAttente` est vrai et que la limite est atteinte).
     * Outils et sortie structurée d'un agent du catalogue passent par `overrides`.
     * https://hub.hcompany.ai/agents-api/sessions/create.md
     * https://hub.hcompany.ai/agents-api/custom-tools.md
     * https://hub.hcompany.ai/agents-api/structured-output.md
     */
    async creerSession(params: CreerSessionParams): Promise<Session> {
      const reponse = await requete("POST", "/sessions", {
        corps: corpsCreation(params),
        entetes: params.cleIdempotence ? { "Idempotency-Key": params.cleIdempotence } : undefined,
        reessayer429: false,
        reessayer5xx: Boolean(params.cleIdempotence),
      });
      return sessionSchema.parse(await reponse.json());
    },

    /**
     * Lit l'objet session complet : `GET /sessions/{id}`. C'est lui qui porte
     * `agent_view_url` et `latest_answer` (la réponse finale, une fois la session terminée).
     * https://hub.hcompany.ai/agents-api/sessions/retrieve.md
     */
    async lireSession(sessionId: string): Promise<Session> {
      const reponse = await requete("GET", `/sessions/${encodeURIComponent(sessionId)}`, {
        reessayer5xx: true,
      });
      return sessionSchema.parse(await reponse.json());
    },

    lireEtat,

    /**
     * Lit les appels d'outils en attente (raccourci sur `lireEtat`). Un appel auquel on
     * vient de répondre peut rester listé jusqu'au prochain rapport de l'agent.
     * https://hub.hcompany.ai/agents-api/custom-tools.md (Detect the pending call)
     */
    async lireAppelsEnAttente(sessionId: string): Promise<AppelOutilHai[]> {
      return (await lireEtat(sessionId)).pending_tool_calls;
    },

    /**
     * Lit les nouveaux événements : `GET /sessions/{id}/changes`. Renvoie `null` sur un
     * 204 (rien de neuf). `attenteS` (0 à 25) fait patienter le serveur. Les événements
     * exposent les pages vues (`observation_event.metadata.url`) et les actions choisies
     * (`policy_event.tool_reqs`).
     * https://hub.hcompany.ai/agents-api/sessions/changes.md
     * https://hub.hcompany.ai/agents-api/sessions/event-object.md
     */
    async lireChangements(
      sessionId: string,
      parametres: { depuis?: number; attenteS?: number; limite?: number } = {},
    ): Promise<Changements | null> {
      const attenteS = Math.min(Math.max(parametres.attenteS ?? 0, 0), 25);
      const requeteUrl = new URLSearchParams({
        from_index: String(parametres.depuis ?? 0),
        wait_for_seconds: String(attenteS),
      });
      if (parametres.limite !== undefined) requeteUrl.set("limit", String(parametres.limite));
      const reponse = await requete(
        "GET",
        `/sessions/${encodeURIComponent(sessionId)}/changes?${requeteUrl}`,
        { reessayer5xx: true, delaiMs: delaiParDefautMs + attenteS * 1000 },
      );
      if (reponse.status === 204) return null;
      return changementsSchema.parse(await reponse.json());
    },

    /**
     * Répond aux appels d'outils : `POST /sessions/{id}/tool_results`, réponse 202.
     * Un seul résultat est envoyé seul, plusieurs en `{ type: "batch", results }`.
     * Chaque résultat renvoie le `tool_req` reçu, tel quel. L'API ne vérifie pas l'`id`.
     * 409 : la session est déjà terminée.
     * https://hub.hcompany.ai/agents-api/sessions/tool-results.md
     */
    async envoyerResultatsOutils(sessionId: string, resultats: ResultatOutilHai[]): Promise<void> {
      if (resultats.length === 0) return;
      const corps = resultats.length === 1 ? resultats[0] : { type: "batch", results: resultats };
      const reponse = await requete(
        "POST",
        `/sessions/${encodeURIComponent(sessionId)}/tool_results`,
        { corps },
      );
      await reponse.body?.cancel().catch(() => undefined);
    },

    /**
     * Envoie un message de pilotage : `POST /sessions/{id}/messages`, réponse 202.
     * L'agent le lit à l'étape suivante. Attention : sur une session terminée, un
     * message la RELANCE (et elle est refacturée). Vérifier l'état avant d'appeler.
     * https://hub.hcompany.ai/agents-api/sessions/send-messages.md
     */
    async envoyerMessage(sessionId: string, message: string): Promise<void> {
      const reponse = await requete("POST", `/sessions/${encodeURIComponent(sessionId)}/messages`, {
        corps: { type: "user_message", message },
      });
      await reponse.body?.cancel().catch(() => undefined);
    },

    /**
     * Annule : `DELETE /sessions/{id}`, réponse 204. La session finit `interrupted` et
     * libère sa place. Sans effet sur une session déjà terminée.
     * https://hub.hcompany.ai/agents-api/sessions/cancel.md
     */
    async annulerSession(sessionId: string): Promise<void> {
      const reponse = await requete("DELETE", `/sessions/${encodeURIComponent(sessionId)}`, {
        reessayer5xx: true,
      });
      await reponse.body?.cancel().catch(() => undefined);
    },

    /**
     * Lit le quota de sessions simultanées : `GET /sessions/quota`.
     * https://hub.hcompany.ai/agents-api/sessions/quota.md
     */
    async lireQuota(): Promise<Quota> {
      const reponse = await requete("GET", "/sessions/quota", { reessayer5xx: true });
      return quotaSchema.parse(await reponse.json());
    },
  };
}

export type ClientHai = ReturnType<typeof creerClientHai>;
