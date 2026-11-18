#!/usr/bin/env node
/**
 * Synchronisation repo ↔ n8n par l'API publique n8n (/api/v1, en-tête X-N8N-API-KEY).
 *
 *   npm run n8n:pull [-- nom ...]        instance → n8n/<nom>.json
 *   npm run n8n:push [-- nom ...]        simulation : affiche ce qui serait envoyé
 *   npm run n8n:push -- --confirmer      n8n/*.json → instance
 *   npm run n8n:articles                 régénère la copie de n8n/articles_suivis.json dans le workflow
 *
 * Ciblage : un fichier n8n/<nom>.json désigne son workflow par l'`id` qu'il contient, pas
 * par son nom. Le nom ne sert que tant que le fichier n'a pas encore d'id (premier export,
 * ou création). Les workflows dont le nom commence par « archive · » sont ignorés partout.
 *
 * Sans nom en argument, pull et push portent sur les workflows qui ont un fichier dans n8n/.
 * Un workflow de l'instance sans fichier ici n'est donc jamais exporté par défaut.
 *
 * Variables : N8N_URL et N8N_API_KEY, lues dans l'environnement ou dans le .env de la
 * racine. Elles ne sont jamais affichées. Aucune dépendance : Node 20.12 ou plus.
 * Le script n'active, ne désactive et n'exécute jamais un workflow.
 */
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "n8n");
const NOM_VALIDE = /^[A-Za-z0-9_.-]+$/;
const PREFIXE_ARCHIVE = "archive · ";

/**
 * Copies générées : n8n ne peut pas lire un fichier du dépôt à l'exécution. Le fichier
 * `source` reste la référence, le nœud Code `noeud` du workflow en porte une copie, et le
 * push échoue si les deux divergent.
 */
const COPIES_GENEREES = [
  { source: "articles_suivis.json", cle: "articles", workflow: "veille_reglementaire", noeud: "Articles suivis" },
];

/** Clés de `settings` acceptées en écriture (schéma workflowSettings de l'API publique). */
const CLES_SETTINGS = [
  "saveExecutionProgress",
  "saveManualExecutions",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "executionTimeout",
  "errorWorkflow",
  "timezone",
  "executionOrder",
  "callerPolicy",
  "callerIds",
  "timeSavedPerExecution",
  "availableInMCP",
];

class Erreur extends Error {}

/* ---------- Configuration et HTTP ---------- */

function chargerConfig() {
  const fichierEnv = path.join(RACINE, ".env");
  if (existsSync(fichierEnv)) process.loadEnvFile(fichierEnv);

  const { N8N_URL: url, N8N_API_KEY: cle } = process.env;
  if (!url || !cle) {
    throw new Erreur(
      "N8N_URL et N8N_API_KEY doivent être définies, dans l'environnement ou dans le .env à la racine du dépôt.",
    );
  }
  let base;
  try {
    base = new URL(url);
  } catch {
    throw new Erreur("N8N_URL n'est pas une URL valide.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !local) {
    throw new Erreur("N8N_URL doit être en https : la clé d'API ne part pas en clair.");
  }
  const racineApi = `${base.href.replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1`;
  return { racineApi, cle };
}

/** Verrou : seul `push --confirmer` l'ouvre. Sans lui, aucune requête d'écriture ne part. */
let ecritureAutorisee = false;

/** Appel à l'API. Les messages d'erreur ne contiennent ni l'URL de l'instance ni la clé. */
async function api(config, methode, chemin, corps) {
  if (methode !== "GET" && !ecritureAutorisee) {
    throw new Erreur(`${methode} ${chemin} refusé : écriture non confirmée.`);
  }
  let reponse;
  try {
    reponse = await fetch(config.racineApi + chemin, {
      method: methode,
      headers: {
        accept: "application/json",
        "X-N8N-API-KEY": config.cle,
        ...(corps ? { "content-type": "application/json" } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (erreur) {
    throw new Erreur(
      `${methode} ${chemin} : instance injoignable (${erreur.cause?.code ?? erreur.name}).`,
    );
  }
  if (!reponse.ok) {
    let detail = "";
    try {
      detail = String((await reponse.json()).message ?? "").slice(0, 300);
    } catch {
      // Corps absent ou non JSON : le code HTTP suffit.
    }
    throw new Erreur(`${methode} ${chemin} : HTTP ${reponse.status}${detail ? ` (${detail})` : ""}.`);
  }
  return reponse.json();
}

const estArchive = (workflow) => String(workflow.name ?? "").startsWith(PREFIXE_ARCHIVE);

/** Liste les workflows de l'instance (pagination par curseur), archives exclues. */
async function listerDistants(config) {
  const workflows = [];
  let curseur;
  do {
    const requete = new URLSearchParams({ limit: "250", excludePinnedData: "true" });
    if (curseur) requete.set("cursor", curseur);
    const page = await api(config, "GET", `/workflows?${requete}`);
    workflows.push(...(page.data ?? []));
    curseur = page.nextCursor;
  } while (curseur);
  return { tous: workflows, suivis: workflows.filter((workflow) => !estArchive(workflow)) };
}

const lireDistant = (config, id) =>
  api(config, "GET", `/workflows/${encodeURIComponent(id)}?excludePinnedData=true`);

/* ---------- Normalisation ---------- */

function trierCles(valeur) {
  if (Array.isArray(valeur)) return valeur.map(trierCles);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.keys(valeur)
        .sort()
        .map((cle) => [cle, trierCles(valeur[cle])]),
    );
  }
  return valeur;
}

/**
 * Forme versionnée d'un workflow : uniquement ce qui le définit, clés triées.
 * Sont écartés les champs volatils ou propres à l'instance : createdAt, updatedAt,
 * versionId, activeVersion, staticData (état d'exécution), pinData (données de test),
 * shared (projet et propriétaire), tags, meta.
 */
export function normaliser(workflow) {
  return trierCles({
    id: workflow.id,
    name: workflow.name,
    active: workflow.active ?? false,
    nodes: (workflow.nodes ?? []).map(({ createdAt, updatedAt, ...noeud }) => noeud),
    connections: workflow.connections ?? {},
    settings: workflow.settings ?? {},
  });
}

export const serialiser = (workflow) => `${JSON.stringify(normaliser(workflow), null, 2)}\n`;

/* ---------- Détection de secrets en dur ---------- */

const NOM_SENSIBLE =
  /(api[-_ ]?key|secret|token|passw(or)?d|authorization|bearer|private[-_ ]?key|access[-_ ]?key|cookie)/i;

const MOTIFS = [
  ["jeton Bearer en dur", /Bearer\s+[A-Za-z0-9._~+/-]{16,}/],
  ["jeton JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ["clé au format sk-", /\bsk-[A-Za-z0-9_-]{16,}/],
  ["jeton Hugging Face", /\bhf_[A-Za-z0-9]{20,}/],
  ["jeton GitHub", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["jeton Slack", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["clé d'accès AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["clé privée", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["identifiants dans une URL", /:\/\/[^/\s:@{}]+:[^/\s:@{}]+@/],
  [
    "secret dans les paramètres d'une URL",
    /[?&](api[-_]?key|key|token|access_token|secret|password|signature|sig)=[^&\s{}'"`]{8,}/i,
  ],
  [
    "secret affecté dans du code",
    /(api[-_]?key|secret|token|passw(or)?d)["']?\s*[:=]\s*["'`][^"'`${}\s]{8,}["'`]/i,
  ],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Partie littérale d'une valeur n8n, une fois retirées les expressions {{ … }}. */
function partieLitterale(valeur) {
  return valeur
    .replace(/^=/, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\b(Bearer|Basic|Token)\b/gi, "")
    .trim();
}

function longueChaineAleatoire(valeur) {
  return (valeur.match(/[A-Za-z0-9_-]{32,}/g) ?? []).some(
    (bloc) => !UUID.test(bloc) && /[0-9]/.test(bloc) && /[A-Za-z]/.test(bloc),
  );
}

/**
 * Cherche des secrets écrits en dur dans les paramètres et les notes des nœuds.
 * Heuristique : elle ne remplace pas une relecture. Ne renvoie jamais la valeur trouvée.
 */
export function chercherSecrets(workflow) {
  const alertes = [];

  function parcourir(valeur, chemin, noeud, cle) {
    if (typeof valeur === "string") {
      const regles = MOTIFS.filter(([, motif]) => motif.test(valeur)).map(([nom]) => nom);
      if (cle && NOM_SENSIBLE.test(cle) && partieLitterale(valeur).length >= 8) {
        regles.push(`valeur en dur dans le champ « ${cle} »`);
      }
      if (regles.length === 0 && longueChaineAleatoire(partieLitterale(valeur))) {
        regles.push("longue chaîne aléatoire");
      }
      for (const regle of regles) alertes.push({ noeud, chemin, regle });
      return;
    }
    if (Array.isArray(valeur)) {
      valeur.forEach((element, index) => parcourir(element, `${chemin}[${index}]`, noeud, cle));
      return;
    }
    if (valeur && typeof valeur === "object") {
      // Paire { name, value } : en-têtes HTTP, paramètres de requête, champs d'un nœud Set.
      const { name: nom, value } = valeur;
      if (
        typeof nom === "string" &&
        typeof value === "string" &&
        NOM_SENSIBLE.test(nom) &&
        partieLitterale(value).length >= 8
      ) {
        alertes.push({ noeud, chemin: `${chemin}.value`, regle: `valeur en dur pour « ${nom} »` });
      }
      for (const [sousCle, sousValeur] of Object.entries(valeur)) {
        parcourir(sousValeur, `${chemin}.${sousCle}`, noeud, sousCle);
      }
    }
  }

  for (const noeud of workflow.nodes ?? []) {
    parcourir(noeud.parameters ?? {}, "parameters", noeud.name);
    parcourir(noeud.notes ?? "", "notes", noeud.name);
  }
  return alertes;
}

function afficherAlertes(nom, alertes) {
  if (alertes.length === 0) return;
  console.warn(`  ⚠ ${nom} : ${alertes.length} secret(s) possible(s) en dur. Ne pas commiter sans relire :`);
  for (const { noeud, chemin, regle } of alertes) {
    console.warn(`      nœud « ${noeud} », ${chemin} : ${regle}`);
  }
}

/* ---------- Fichiers locaux ---------- */

const cheminLocal = (nom) => path.join(DOSSIER, `${nom}.json`);

/**
 * Workflows versionnés : les fichiers n8n/*.json qui portent un tableau `nodes`.
 * Les autres JSON du dossier (articles_suivis.json…) ne sont pas des workflows.
 */
async function workflowsLocaux() {
  const locaux = new Map();
  for (const fichier of (await readdir(DOSSIER)).filter((f) => f.endsWith(".json")).sort()) {
    const contenu = JSON.parse(await readFile(path.join(DOSSIER, fichier), "utf8"));
    if (contenu && !Array.isArray(contenu) && Array.isArray(contenu.nodes)) {
      locaux.set(path.basename(fichier, ".json"), contenu);
    }
  }
  return locaux;
}

function verifierNoms(noms) {
  for (const nom of noms) {
    if (!NOM_VALIDE.test(nom)) {
      throw new Erreur(
        `« ${nom} » ne peut pas servir de nom de fichier (lettres, chiffres, _ . - seulement). Renommer le workflow dans n8n.`,
      );
    }
  }
}

/**
 * Retrouve sur l'instance le workflow d'un fichier local.
 * Avec un id : c'est lui, et lui seul. Sans id : par nom, parmi les workflows non archivés.
 */
function resoudre(distants, nom, id) {
  if (id) {
    const cible = distants.tous.find((workflow) => workflow.id === id);
    if (!cible) {
      throw new Erreur(`n8n/${nom}.json pointe vers l'id ${id}, introuvable sur l'instance.`);
    }
    if (estArchive(cible)) {
      throw new Erreur(`n8n/${nom}.json pointe vers un workflow archivé (« ${cible.name} »).`);
    }
    if (cible.name !== nom) {
      throw new Erreur(
        `n8n/${nom}.json porte l'id du workflow « ${cible.name} » : nom de fichier et nom du workflow doivent être identiques.`,
      );
    }
    return cible;
  }
  const trouves = distants.suivis.filter((workflow) => workflow.name === nom);
  if (trouves.length > 1) {
    throw new Erreur(`${trouves.length} workflows s'appellent « ${nom} » sur l'instance : en renommer un.`);
  }
  return trouves[0];
}

/* ---------- Copies générées ---------- */

function codeGenere(source, elements) {
  return [
    `// Copie générée depuis n8n/${source} par \`npm run n8n:articles\`. Ne pas modifier ici :`,
    "// modifier le fichier du dépôt, régénérer, puis pousser.",
    `const elements = ${JSON.stringify(elements, null, 2)};`,
    "",
    "return elements.map((element) => ({ json: element }));",
    "",
  ].join("\n");
}

async function lireCopie({ source, cle }) {
  const contenu = JSON.parse(await readFile(path.join(DOSSIER, source), "utf8"));
  if (!Array.isArray(contenu[cle])) throw new Erreur(`n8n/${source} doit contenir un tableau « ${cle} ».`);
  return codeGenere(source, contenu[cle]);
}

/** Vérifie qu'un workflow local porte bien la copie à jour de ses fichiers sources. */
async function verifierCopies(nom, workflow) {
  for (const copie of COPIES_GENEREES.filter((c) => c.workflow === nom)) {
    if (!existsSync(path.join(DOSSIER, copie.source))) continue;
    const noeud = (workflow.nodes ?? []).find((n) => n.name === copie.noeud);
    if (!noeud) throw new Erreur(`n8n/${nom}.json n'a pas de nœud « ${copie.noeud} ».`);
    if (noeud.parameters?.jsCode !== (await lireCopie(copie))) {
      throw new Erreur(
        `Le nœud « ${copie.noeud} » de ${nom} ne correspond plus à n8n/${copie.source} : lancer \`npm run n8n:articles\`.`,
      );
    }
  }
}

async function regenererCopies() {
  const locaux = await workflowsLocaux();
  for (const copie of COPIES_GENEREES) {
    const workflow = locaux.get(copie.workflow);
    const noeud = workflow?.nodes.find((n) => n.name === copie.noeud);
    if (!noeud) throw new Erreur(`n8n/${copie.workflow}.json n'a pas de nœud « ${copie.noeud} ».`);
    const code = await lireCopie(copie);
    if (noeud.parameters?.jsCode === code) {
      console.log(`  = ${copie.workflow} · « ${copie.noeud} » : déjà à jour`);
      continue;
    }
    noeud.parameters = { ...noeud.parameters, jsCode: code };
    await writeFile(cheminLocal(copie.workflow), serialiser(workflow));
    console.log(`  ✎ ${copie.workflow} · « ${copie.noeud} » : régénéré depuis n8n/${copie.source}`);
  }
}

/* ---------- Commandes ---------- */

async function pull(noms) {
  const config = chargerConfig();
  const locaux = await workflowsLocaux();
  const cibles = noms.length > 0 ? noms : [...locaux.keys()];
  verifierNoms(cibles);
  const distants = await listerDistants(config);
  let alerte = false;

  for (const nom of cibles) {
    const resume = resoudre(distants, nom, locaux.get(nom)?.id);
    if (!resume) {
      console.log(`  – ${nom} : absent de l'instance, fichier laissé tel quel`);
      continue;
    }
    const workflow = await lireDistant(config, resume.id);
    const contenu = serialiser(workflow);
    const fichier = cheminLocal(nom);
    const ancien = existsSync(fichier) ? await readFile(fichier, "utf8") : null;
    if (ancien === contenu) {
      console.log(`  = ${nom} : inchangé`);
    } else {
      await writeFile(fichier, contenu);
      console.log(`  ↓ ${nom} : ${ancien === null ? "créé" : "mis à jour"} (${workflow.nodes?.length ?? 0} nœuds)`);
    }
    const alertes = chercherSecrets(workflow);
    afficherAlertes(nom, alertes);
    alerte ||= alertes.length > 0;
  }
  if (alerte) console.warn("\nDes secrets possibles ont été détectés : les retirer avant tout commit.");
}

/** Corps accepté par POST et PUT /workflows : les champs en lecture seule sont exclus. */
function corpsEcriture(workflow) {
  const settings = {};
  const ecartees = [];
  for (const [cle, valeur] of Object.entries(workflow.settings ?? {})) {
    if (CLES_SETTINGS.includes(cle)) settings[cle] = valeur;
    else ecartees.push(cle);
  }
  return {
    corps: {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections ?? {},
      settings,
    },
    ecartees,
  };
}

async function push(arguments_) {
  const confirmer = arguments_.includes("--confirmer");
  ecritureAutorisee = confirmer;
  const noms = arguments_.filter((argument) => !argument.startsWith("--"));
  const config = chargerConfig();
  const locaux = await workflowsLocaux();
  const cibles = noms.length > 0 ? noms : [...locaux.keys()];
  verifierNoms(cibles);
  const distants = await listerDistants(config);

  console.log(
    confirmer
      ? "Envoi vers l'instance (--confirmer)."
      : "Simulation : rien n'est modifié sur l'instance. Ajouter --confirmer pour envoyer.",
  );

  for (const nom of cibles) {
    const local = locaux.get(nom);
    if (!local) throw new Erreur(`n8n/${nom}.json n'existe pas ou n'est pas un workflow.`);
    if (local.nodes.length === 0) {
      console.log(`  – ${nom} : amorce vide, ignorée`);
      continue;
    }
    if (local.name !== nom) {
      throw new Erreur(`n8n/${nom}.json décrit le workflow « ${local.name} » : nom de fichier et nom du workflow doivent être identiques.`);
    }
    await verifierCopies(nom, local);
    afficherAlertes(nom, chercherSecrets(local));

    const resume = resoudre(distants, nom, local.id);
    if (!local.id && resume) {
      throw new Erreur(
        `Un workflow « ${nom} » existe déjà sur l'instance, mais n8n/${nom}.json n'a pas d'id : lancer n8n:pull pour l'enregistrer.`,
      );
    }
    const { corps, ecartees } = corpsEcriture(local);
    if (ecartees.length > 0) {
      console.warn(`  ⚠ ${nom} : réglages non acceptés par l'API, non envoyés : ${ecartees.join(", ")}`);
    }

    if (!resume) {
      console.log(`  + ${nom} : à créer (désactivé)`);
      if (confirmer) {
        const cree = await api(config, "POST", "/workflows", corps);
        await writeFile(cheminLocal(nom), serialiser(await lireDistant(config, cree.id)));
        console.log(`      créé, id ${cree.id} enregistré dans n8n/${nom}.json`);
      }
      continue;
    }

    const distant = await lireDistant(config, resume.id);
    if (serialiser(distant) === serialiser({ ...local, id: distant.id, active: distant.active })) {
      console.log(`  = ${nom} : identique`);
      continue;
    }
    console.log(`  ↑ ${nom} : à mettre à jour`);
    if (distant.active) {
      console.warn("      ⚠ ce workflow est actif : n8n republie automatiquement la version mise à jour.");
    }
    if (confirmer) {
      await api(config, "PUT", `/workflows/${encodeURIComponent(distant.id)}`, corps);
      console.log("      mis à jour");
    }
  }
}

async function main() {
  const [commande, ...reste] = process.argv.slice(2);
  if (commande === "pull") return pull(reste.filter((argument) => !argument.startsWith("--")));
  if (commande === "push") return push(reste);
  if (commande === "articles") return regenererCopies();
  throw new Erreur("Usage : node scripts/n8n-sync.mjs pull|push|articles [nom ...] [--confirmer]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    // Seules les erreurs prévues sont détaillées : une erreur inattendue pourrait citer une requête.
    console.error(erreur instanceof Erreur ? `Erreur : ${erreur.message}` : `Erreur inattendue : ${erreur.name}`);
    process.exitCode = 1;
  });
}
