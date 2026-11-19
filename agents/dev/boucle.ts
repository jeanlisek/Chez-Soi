/**
 * Boucle locale d'un run de l'agent H, commune aux usages (run_u2.ts aujourd'hui,
 * run_u1.ts ensuite). Pas de webhook : on interroge la session.
 *
 * Ce que fait la boucle :
 *  - vérifie le quota, puis crée UNE session (jamais de relance automatique) ;
 *  - suit l'état (`/status`) et les événements (`/changes`) ;
 *  - sert les custom tools, avec un cache : un même appel reçoit toujours la même réponse ;
 *  - coupe-circuit : annule dès qu'une page vue ou une action vise une page de commande,
 *    de paiement, de livraison, de connexion ou de compte ;
 *  - délais : global, et après la réponse à l'outil de validation ;
 *  - Ctrl+C annule la session (pour libérer une des 3 places) ;
 *  - enregistre le run dans `agents/bench/runs/`, sans lien d'accès ni secret.
 *
 * Limite connue : l'API H n'a pas de garde-fou natif sur une action du navigateur. Le
 * coupe-circuit réagit APRÈS coup (au plus tard quelques secondes après la page vue) ;
 * il n'empêche pas le clic. Voir agents/README.md.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  creerClientHai,
  estEtatTerminal,
  HaiErreur,
  outcomeConnu,
  type AppelOutilHai,
  type ClientHai,
  type CreerSessionParams,
  type EtatSession,
  type EvenementHai,
  type OutilHai,
  type ResultatOutilHai,
} from "../../apps/web/lib/hai";
import { runAgentSchema, type RunAgent, type SchemaZod } from "../../apps/web/lib/schemas";
import { evaluerSortie } from "./controle";

/* ---------- Coupe-circuit ---------- */

export type MotifsInterdits = {
  /** Interdits partout. */
  stricts: string[];
  /**
   * Interdits dans le chemin (et le sous-domaine, le fragment), sans exception « panier » :
   * `/checkout/?from=cart`, `/panier/validation` ou `/gp/buy/` déclenchent (relecture de Briac,
   * PR #9). Pas dans les paramètres : un tri `?order=prix` ne déclenche rien.
   */
  tunnel: string[];
};

export const MOTIFS_INTERDITS_PAR_DEFAUT: MotifsInterdits = {
  stricts: [
    "paiement",
    "payment",
    "payer",
    "pay",
    "livraison",
    "shipping",
    "delivery",
    "login",
    "signin",
    "connexion",
    "identification",
    "authentification",
    "compte",
    "account",
    "register",
    "signup",
    "inscription",
  ],
  tunnel: ["checkout", "commande", "commander", "order", "orders", "buy", "caisse", "purchase", "validation", "valider"],
};

/** Paramètres de recherche : leur valeur est du texte libre, pas une destination. */
const CLES_DE_RECHERCHE = ["q", "query", "search", "s", "k", "w", "text", "keywords", "recherche"];

function jetons(texte: string): string[] {
  let decode = texte;
  try {
    decode = decodeURIComponent(texte);
  } catch {
    // Séquence d'échappement invalide : on garde le texte brut.
  }
  return decode
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Renvoie le motif interdit trouvé dans une URL, ou `null`. Mots stricts : sous-domaines,
 * chemin, fragment et valeurs des paramètres (hors recherche). Mots du tunnel de commande :
 * sous-domaines, chemin et fragment seulement. Découpage en mots : « order » ne déclenche
 * pas sur « border ». Pour la démo, compléter par une liste de chemins autorisés par site
 * (`horsCheminsAutorises`).
 */
export function detecterPageInterdite(
  urlBrute: string,
  motifs: MotifsInterdits = MOTIFS_INTERDITS_PAR_DEFAUT,
): string | null {
  let url: URL;
  try {
    url = new URL(urlBrute);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const motsChemin = new Set<string>();
  const ajouterChemin = (texte: string) => jetons(texte).forEach((mot) => motsChemin.add(mot));
  url.hostname.split(".").slice(0, -2).forEach(ajouterChemin);
  ajouterChemin(url.pathname);
  ajouterChemin(url.hash);
  const mots = new Set(motsChemin);
  for (const [cle, valeur] of url.searchParams) {
    if (!CLES_DE_RECHERCHE.includes(cle.toLowerCase())) jetons(valeur).forEach((mot) => mots.add(mot));
  }

  const strict = motifs.stricts.find((motif) => mots.has(motif));
  if (strict) return strict;
  return motifs.tunnel.find((motif) => motsChemin.has(motif)) ?? null;
}

/** Pages autorisées d'un site : hôte exact (ou sous-domaine) et préfixes de chemin. */
export type CheminsAutorises = { hote: string; exacts?: string[]; prefixes: string[] }[];

/**
 * Liste blanche par site : renvoie un motif si l'URL n'est pas sur un des hôtes autorisés,
 * ou si son chemin ne commence par aucun des préfixes de cet hôte. `null` si la page est permise.
 */
export function horsCheminsAutorises(urlBrute: string, autorises: CheminsAutorises): string | null {
  let url: URL;
  try {
    url = new URL(urlBrute);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hote = url.hostname.toLowerCase();
  const site = autorises.find((a) => hote === a.hote || hote.endsWith(`.${a.hote}`));
  if (!site) return `hors site (${hote})`;
  const chemin = url.pathname.toLowerCase();
  const sansBarre = chemin.replace(/\/+$/, "");
  const permise =
    (site.exacts ?? []).some((exact) => sansBarre === exact.replace(/\/+$/, "")) ||
    site.prefixes.some((prefixe) => chemin.startsWith(prefixe));
  return permise
    ? null
    : `chemin non autorisé (${url.pathname})`;
}

function chainesDe(valeur: unknown, sortie: string[] = []): string[] {
  if (typeof valeur === "string") sortie.push(valeur);
  else if (Array.isArray(valeur)) valeur.forEach((element) => chainesDe(element, sortie));
  else if (valeur && typeof valeur === "object") {
    Object.values(valeur).forEach((element) => chainesDe(element, sortie));
  }
  return sortie;
}

type Lecture = { urls: { url: string; source: string }[]; actions: string[] };

/**
 * Ce qu'un événement expose de l'activité de l'agent.
 * https://hub.hcompany.ai/agents-api/sessions/event-object.md (Agent activity, Observation shapes)
 */
export function lireEvenement(evenement: EvenementHai, outilsMaison: ReadonlySet<string>): Lecture {
  const lecture: Lecture = { urls: [], actions: [] };
  if (evenement.type !== "AgentEvent" || !evenement.data) return lecture;
  const data = evenement.data;

  if (data.kind === "observation_event") {
    const url = (data.metadata as { url?: unknown } | null | undefined)?.url;
    if (typeof url === "string" && url) lecture.urls.push({ url, source: "page" });
  }

  if (data.kind === "policy_event" && Array.isArray(data.tool_reqs)) {
    for (const requete of data.tool_reqs as { tool_name?: unknown; args?: unknown }[]) {
      const nom = typeof requete?.tool_name === "string" ? requete.tool_name : "inconnu";
      lecture.actions.push(nom);
      if (outilsMaison.has(nom)) continue;
      for (const chaine of chainesDe(requete?.args)) {
        if (/^https?:\/\//i.test(chaine.trim())) {
          lecture.urls.push({ url: chaine.trim(), source: `action ${nom}` });
        }
      }
    }
  }
  return lecture;
}

/* ---------- Nettoyage avant écriture ---------- */

const PARAMETRE_SENSIBLE = /token|key|secret|session|sid|auth|sig|pass|jwt|code|email|mail/i;

/** Retire d'une URL les paramètres qui ressemblent à un jeton ou à une donnée personnelle. */
export function nettoyerUrl(texte: string): string {
  if (!/^https?:\/\//i.test(texte)) return texte;
  try {
    const url = new URL(texte);
    url.username = "";
    url.password = "";
    for (const cle of [...url.searchParams.keys()]) {
      if (PARAMETRE_SENSIBLE.test(cle)) url.searchParams.delete(cle);
    }
    return url.toString();
  } catch {
    return texte;
  }
}

function nettoyer<T>(valeur: T): T {
  if (typeof valeur === "string") return nettoyerUrl(valeur) as T;
  if (Array.isArray(valeur)) return valeur.map(nettoyer) as T;
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.entries(valeur).map(([cle, element]) => [cle, nettoyer(element)]),
    ) as T;
  }
  return valeur;
}

function sansRequete(texte: string): string {
  try {
    const url = new URL(texte);
    return `${url.origin}${url.pathname}`;
  } catch {
    return texte;
  }
}

/* ---------- Run ---------- */

export type ContexteOutil = {
  sessionId: string;
  /** Interrompu par Ctrl+C ou par le délai global : une question posée dans le terminal doit s'y abonner. */
  signal: AbortSignal;
};

export type OutilLocal = {
  /** Déclaration au format de la doc H : `{ name, description, input_schema }`. */
  declaration: OutilHai;
  /** Doit pouvoir être appelé deux fois sans dommage. Une exception devient une erreur visible par l'agent. */
  executer: (args: Record<string, unknown>, contexte: ContexteOutil) => Promise<unknown>;
  /** Vrai pour l'outil de validation : après sa réponse, la session a `delaiApresValidationMs` pour finir. */
  validation?: boolean;
};

export type OptionsRun<S> = {
  usage: RunAgent["usage"];
  agent: string;
  prompt: string;
  outils: OutilLocal[];
  /** Schéma Zod de la réponse finale, et son JSON Schema envoyé à H. */
  schemaSortie: SchemaZod<S>;
  formatReponse: Record<string, unknown>;
  /** Contrôles métier, lancés si le schéma est respecté : renvoie la liste des écarts. */
  controlerSortie?: (sortie: S) => string[];
  site?: string;
  urlDepart?: string;
  dossierRuns: string;
  /** Attente maximale entre deux lectures (3 s par défaut). */
  intervalleMs?: number;
  /** Délai global du run (10 min par défaut), puis annulation. */
  delaiGlobalMs?: number;
  /** Délai laissé à la session après la réponse à l'outil de validation (60 s par défaut). */
  delaiApresValidationMs?: number;
  /** Filet côté serveur si le script meurt sans annuler (`max_time_s`, 600 par défaut). */
  maxTimeS?: number;
  /** Surcharges supplémentaires de `POST /sessions`, par chemin (par exemple `agent.skills`). */
  overrides?: Record<string, unknown>;
  /** `null` désactive le coupe-circuit. */
  motifsInterdits?: MotifsInterdits | null;
  /** Lancer même si une session est déjà active sur le compte. */
  malgreSessionsActives?: boolean;
  /** Affiche la requête de création sans rien envoyer. */
  aBlanc?: boolean;
  client?: ClientHai;
  journal?: (ligne: string) => void;
};

export type ResultatRun<S> = { run: RunAgent; fichier: string; sortie: S | null };

const attendre = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const DELAI_RENVOI_MS = 30_000;

function cleAppel(appel: AppelOutilHai): string {
  return appel.id ?? `${appel.tool_name}:${JSON.stringify(appel.args ?? {})}`;
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

export async function executerRun<S>(options: OptionsRun<S>): Promise<ResultatRun<S> | null> {
  const journal = options.journal ?? ((ligne: string) => console.log(ligne));
  const client = options.client ?? creerClientHai();
  const intervalleMs = options.intervalleMs ?? 3_000;
  const delaiGlobalMs = options.delaiGlobalMs ?? 10 * 60_000;
  const delaiApresValidationMs = options.delaiApresValidationMs ?? 60_000;
  const motifs =
    options.motifsInterdits === undefined ? MOTIFS_INTERDITS_PAR_DEFAUT : options.motifsInterdits;
  const outilsParNom = new Map(options.outils.map((outil) => [outil.declaration.name, outil]));
  const outilsMaison = new Set(outilsParNom.keys());

  const parametres: CreerSessionParams = {
    agent: options.agent,
    messages: options.prompt,
    outils: options.outils.map((outil) => outil.declaration),
    formatReponse: options.formatReponse,
    urlDepart: options.urlDepart,
    ...(options.overrides ? { overrides: options.overrides } : {}),
    maxTimeS: options.maxTimeS ?? 600,
    fileAttente: false,
    timezone: "Europe/Paris",
    cleIdempotence: randomUUID(),
  };

  if (options.aBlanc) {
    journal("Essai à blanc : voici le corps de POST /sessions, rien n'est envoyé.");
    journal(JSON.stringify(client.corpsCreation(parametres), null, 2));
    return null;
  }

  const cle = process.env.H_API_KEY;
  if (!cle) throw new Error("H_API_KEY est absente de l'environnement (fichier .env non chargé ?).");
  journal(`H_API_KEY chargée (${cle.length} caractères).`);

  // Une seule session à la fois : on regarde le quota avant de créer, et on ne met jamais en file.
  const quota = await client.lireQuota();
  journal(`Quota (${quota.scope}) : ${quota.active} session(s) active(s) sur ${quota.limit}.`);
  if (quota.available < 1) {
    throw new Error("Aucune place libre : aucune session créée.");
  }
  if (quota.active > 0 && !options.malgreSessionsActives) {
    throw new Error(
      "Une session est déjà active sur ce compte : aucune session créée. " +
        "Attends sa fin, ou relance avec --malgre-sessions-actives si elle n'est pas à toi.",
    );
  }

  const controleur = new AbortController();
  let interruption = false;
  const surSignal = () => {
    if (interruption) process.exit(130);
    interruption = true;
    journal("\nInterruption demandée : annulation de la session (Ctrl+C à nouveau pour quitter sans attendre).");
    controleur.abort();
  };
  process.on("SIGINT", surSignal);
  process.on("SIGTERM", surSignal);

  const debutLocal = Date.now();
  const session = await client.creerSession(parametres);
  const id = session.id;
  journal(`Session ${id} créée, état : ${session.status.status}.`);
  const vueAgent = session.agent_view_url ?? null;
  if (vueAgent) journal(`Agent View (lien d'accès, à ne pas partager ni commiter) : ${vueAgent}`);

  const minuterieGlobale = setTimeout(() => controleur.abort(), delaiGlobalMs);
  const echeanceGlobale = debutLocal + delaiGlobalMs;
  let echeanceValidation: number | null = null;

  let etat: EtatSession = session.status;
  let dernierEtatAffiche = session.status.status;
  let motifFin: RunAgent["motif_fin"] = "erreur_script";
  let erreurScript: string | null = null;
  let coupeCircuit: RunAgent["coupe_circuit"] = null;
  let coutUsd: number | null = null;
  let decisionValidation: string | null = null;
  const appelsOutils: RunAgent["appels_outils"] = [];
  const pagesVues: string[] = [];
  const actionsAgent: Record<string, number> = {};
  const observations: RunAgent["observations_api"] = {
    appels_sans_id: 0,
    attente_outils_s: 0,
    appels_encore_listes_apres_reponse: 0,
    renvois_de_resultat: 0,
    reponse_presente_apres_annulation: null,
    approbations_natives_vues: 0,
    outcome_brut: null,
  };

  // Idempotence : un même appel (même id, ou même outil et mêmes arguments si l'id est null)
  // reçoit toujours la même réponse, même si H le présente deux fois.
  const cache = new Map<string, Promise<ResultatOutilHai>>();
  const envois = new Map<string, { quand: number; renvois: number; reliste: boolean }>();

  async function executerAppel(appel: AppelOutilHai): Promise<ResultatOutilHai> {
    const outil = outilsParNom.get(appel.tool_name);
    const debut = Date.now();
    let reponse: unknown = null;
    let erreur: string | null = null;
    if (!appel.id) observations.appels_sans_id += 1;

    if (!outil) {
      erreur = `Outil inconnu : ${appel.tool_name}`;
    } else {
      try {
        reponse = await outil.executer(appel.args ?? {}, { sessionId: id, signal: controleur.signal });
      } catch (exception) {
        if (controleur.signal.aborted) throw exception;
        erreur = messageErreur(exception);
      }
    }

    const dureeS = (Date.now() - debut) / 1000;
    observations.attente_outils_s = Math.round((observations.attente_outils_s + dureeS) * 10) / 10;
    appelsOutils.push({
      outil: appel.tool_name,
      args: appel.args ?? {},
      reponse,
      erreur,
      duree_s: Math.round(dureeS * 10) / 10,
    });
    if (outil?.validation && reponse && typeof reponse === "object" && "decision" in reponse) {
      decisionValidation = String((reponse as { decision: unknown }).decision);
    }
    journal(`Outil ${appel.tool_name} : ${erreur ? `erreur (${erreur})` : "réponse prête"}.`);

    return erreur === null
      ? { kind: "tool_result", tool_req: appel, result: reponse }
      : { kind: "error_event", error: erreur, origin: "custom_tools", tool_req: appel };
  }

  /** Renvoie faux si l'attente a été interrompue (Ctrl+C ou délai global). */
  async function servirOutils(appels: AppelOutilHai[]): Promise<boolean> {
    const aEnvoyer: ResultatOutilHai[] = [];
    let validationRepondue = false;

    for (const appel of appels) {
      const cleCache = cleAppel(appel);
      const envoi = envois.get(cleCache);

      if (envoi) {
        // Déjà répondu : la doc prévient qu'un appel peut rester listé jusqu'au prochain rapport.
        if (!envoi.reliste) {
          envoi.reliste = true;
          observations.appels_encore_listes_apres_reponse += 1;
        }
        if (Date.now() - envoi.quand < DELAI_RENVOI_MS || envoi.renvois >= 1) continue;
        envoi.renvois += 1;
        envoi.quand = Date.now();
        observations.renvois_de_resultat += 1;
        journal(`Outil ${appel.tool_name} toujours en attente après 30 s : renvoi de la même réponse.`);
        aEnvoyer.push(await cache.get(cleCache)!);
        continue;
      }

      if (!cache.has(cleCache)) cache.set(cleCache, executerAppel(appel));
      try {
        aEnvoyer.push(await cache.get(cleCache)!);
      } catch (exception) {
        cache.delete(cleCache);
        if (controleur.signal.aborted) return false;
        throw exception;
      }
      envois.set(cleCache, { quand: Date.now(), renvois: 0, reliste: false });
      if (outilsParNom.get(appel.tool_name)?.validation) validationRepondue = true;
    }

    if (aEnvoyer.length > 0) {
      try {
        await client.envoyerResultatsOutils(id, aEnvoyer);
      } catch (exception) {
        if (exception instanceof HaiErreur && exception.statut === 409) {
          journal("La session était déjà terminée : résultat d'outil non remis.");
        } else {
          throw exception;
        }
      }
    }
    if (validationRepondue && echeanceValidation === null) {
      echeanceValidation = Date.now() + delaiApresValidationMs;
      journal(
        `Validation répondue : la session a ${Math.round(delaiApresValidationMs / 1000)} s pour finir, puis elle est annulée.`,
      );
    }
    return true;
  }

  function examiner(evenements: EvenementHai[]): void {
    for (const evenement of evenements) {
      const lecture = lireEvenement(evenement, outilsMaison);
      for (const action of lecture.actions) actionsAgent[action] = (actionsAgent[action] ?? 0) + 1;
      for (const { url, source } of lecture.urls) {
        const page = sansRequete(url);
        if (source === "page" && pagesVues[pagesVues.length - 1] !== page && pagesVues.length < 300) {
          pagesVues.push(page);
        }
        if (!motifs || coupeCircuit) continue;
        const motif = detecterPageInterdite(url, motifs);
        if (motif) coupeCircuit = { motif, source, url: sansRequete(url) };
      }
    }
  }

  try {
    let depuis = 0;
    while (true) {
      if (interruption) {
        motifFin = "interruption";
        break;
      }
      if (Date.now() >= echeanceGlobale) {
        motifFin = "delai_global";
        journal("Délai global atteint.");
        break;
      }
      if (echeanceValidation !== null && Date.now() >= echeanceValidation) {
        motifFin = "delai_apres_validation";
        journal("Délai après validation atteint.");
        break;
      }

      const debutTour = Date.now();

      // 1. Événements. Le long-poll sert de pause : le serveur répond dès qu'il y a du neuf.
      try {
        const changements = await client.lireChangements(id, {
          depuis,
          attenteS: Math.max(1, Math.round(intervalleMs / 1000)),
        });
        if (changements) {
          depuis = (changements.first_index ?? depuis) + changements.new_events.length;
          if (typeof changements.metrics?.total_cost === "number") coutUsd = changements.metrics.total_cost;
          examiner(changements.new_events);
        }
      } catch (exception) {
        journal(`Lecture des événements impossible : ${messageErreur(exception)}`);
        await attendre(intervalleMs);
      }

      if (coupeCircuit) {
        const declenchement: NonNullable<RunAgent["coupe_circuit"]> = coupeCircuit;
        motifFin = "coupe_circuit";
        journal(
          `COUPE-CIRCUIT : « ${declenchement.motif} » (${declenchement.source}) sur ${declenchement.url}. Annulation immédiate.`,
        );
        break;
      }

      // 2. État.
      etat = await client.lireEtat(id);
      if (etat.status !== dernierEtatAffiche) {
        dernierEtatAffiche = etat.status;
        journal(`État : ${etat.status} (étape ${etat.steps}).`);
      }
      if (estEtatTerminal(etat.status)) {
        motifFin = "terminee";
        break;
      }
      if (etat.pending_approvals.length > observations.approbations_natives_vues) {
        observations.approbations_natives_vues = etat.pending_approvals.length;
        journal("L'agent retient un appel pour approbation native : ce script n'approuve jamais.");
      }
      if (etat.pending_tool_calls.length > 0) {
        await servirOutils(etat.pending_tool_calls);
      }

      // 3. Cadence : jamais plus d'une lecture d'état par seconde.
      const ecoule = Date.now() - debutTour;
      if (ecoule < 1000) await attendre(1000 - ecoule);
    }
  } catch (exception) {
    motifFin = "erreur_script";
    erreurScript = messageErreur(exception);
    journal(`Erreur du script : ${erreurScript}`);
  }
  clearTimeout(minuterieGlobale);

  // Fin : on ne laisse jamais une session vivante derrière soi.
  let annulee = false;
  if (!estEtatTerminal(etat.status)) {
    journal("Annulation de la session…");
    try {
      await client.annulerSession(id);
      annulee = true;
    } catch (exception) {
      journal(
        `ANNULATION ÉCHOUÉE (${messageErreur(exception)}). Annule la session ${id} à la main depuis la plateforme H.`,
      );
    }
    for (let essai = 0; essai < 10; essai++) {
      try {
        etat = await client.lireEtat(id);
        if (estEtatTerminal(etat.status)) break;
      } catch {
        // On réessaie.
      }
      await attendre(1500);
    }
    journal(`État : ${etat.status}.`);
  }

  let brut: unknown = null;
  let revision: number | null = null;
  let debutIso = new Date(debutLocal).toISOString();
  let finIso = new Date().toISOString();
  try {
    let finale = await client.lireSession(id);
    if (finale.status.status === "completed" && finale.latest_answer == null) {
      await attendre(2000);
      finale = await client.lireSession(id);
    }
    etat = finale.status;
    brut = finale.latest_answer ?? null;
    revision = finale.agent_revision ?? null;
    debutIso = finale.started_at ?? finale.created_at ?? debutIso;
    finIso = finale.finished_at ?? finIso;
  } catch (exception) {
    journal(`Lecture finale de la session impossible : ${messageErreur(exception)}`);
  }
  process.off("SIGINT", surSignal);
  process.off("SIGTERM", surSignal);

  if (annulee) observations.reponse_presente_apres_annulation = brut !== null;

  // Sortie finale : contrôlée sur une copie normalisée, enregistrée telle que reçue.
  const evaluation = evaluerSortie(brut, options.schemaSortie, options.controlerSortie);

  // `outcome` : une valeur que la doc ne connaît pas est écrite `null` et gardée à part.
  const outcome = outcomeConnu(etat.outcome);
  if (outcome === null && etat.outcome) {
    observations.outcome_brut = etat.outcome;
    journal(`Outcome inconnu renvoyé par H : « ${etat.outcome} ». Enregistré dans observations_api.outcome_brut.`);
  }

  const parModele = etat.usage_per_model.map((usage) => ({
    modele: usage.name,
    entree: usage.input_tokens,
    cache: usage.cached_tokens,
    sortie: usage.output_tokens,
    raisonnement: usage.reasoning_tokens,
  }));
  const somme = (champ: "entree" | "cache" | "sortie" | "raisonnement") =>
    parModele.reduce((total, modele) => total + modele[champ], 0);
  const dureeMs = Date.parse(finIso) - Date.parse(debutIso);

  const run: RunAgent = runAgentSchema.parse(
    nettoyer({
      session_id: id,
      usage: options.usage,
      agent: options.agent,
      agent_revision: revision,
      site: options.site ?? null,
      etat_final: etat.status,
      outcome,
      error_code: etat.error_code ?? null,
      erreur: etat.error ?? erreurScript,
      motif_fin: motifFin,
      annulee_par_script: annulee,
      coupe_circuit: coupeCircuit,
      debut: debutIso,
      fin: finIso,
      duree_s: Math.round((Number.isFinite(dureeMs) ? dureeMs : Date.now() - debutLocal) / 100) / 10,
      nb_etapes: etat.steps,
      tokens:
        parModele.length > 0
          ? {
              entree: somme("entree"),
              cache: somme("cache"),
              sortie: somme("sortie"),
              raisonnement: somme("raisonnement"),
              par_modele: parModele,
            }
          : null,
      cout_usd: coutUsd,
      decision_validation: decisionValidation,
      appels_outils: appelsOutils,
      sortie_finale: evaluation.brut,
      schema_valide: evaluation.schema_valide,
      erreurs_schema: evaluation.erreurs_schema,
      ecarts_metier: evaluation.ecarts_metier,
      pages_vues: pagesVues,
      actions_agent: actionsAgent,
      observations_api: observations,
    } satisfies RunAgent),
  );

  // Dernier contrôle avant d'écrire : ni clé, ni lien d'accès à la session.
  const texte = `${JSON.stringify(run, null, 2)}\n`;
  if (texte.includes(cle) || /Bearer\s+[\w.-]{8,}/.test(texte) || (vueAgent && texte.includes(vueAgent))) {
    throw new Error("Le run contient un secret ou un lien d'accès : fichier non écrit.");
  }

  const jour = new Date().toLocaleDateString("sv-SE");
  const fichier = path.join(options.dossierRuns, `${jour}_${options.usage}_${id}.json`);
  await mkdir(options.dossierRuns, { recursive: true });
  await writeFile(fichier, texte, "utf8");
  journal(`Run enregistré : ${fichier}`);

  return { run, fichier, sortie: evaluation.sortie };
}
