/**
 * Run local de l'usage 3 (démarches, issue #14) : avant l'absence de Jeanne (35 jours,
 * persona fictive), l'agent prépare l'information de l'assureur et l'inscription à
 * l'Opération tranquillité vacances, SANS RIEN ENVOYER. Il n'a aucun identifiant
 * (ni FranceConnect, ni espace client) : il rend les liens et un récapitulatif, puis
 * s'arrête sur demander_validation (action « envoi »). Marc se connecte et envoie lui-même.
 *
 * Depuis apps/web/ :  npm run agent:u3 -- --assureur <maif|altima>
 * Options : --a-blanc (n'envoie rien à H), --agent <nom[:N]>, --malgre-sessions-actives,
 *           --verifier-absence (calcule seulement /api/absence sur la fixture, sans session)
 *
 * UNE session par lancement, jamais de relance automatique. Annoncer le run dans le canal.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { evaluerAbsence } from "../../apps/web/lib/absence";
import { outilHaiSchema, type OutilHai } from "../../apps/web/lib/hai";
import {
  demanderValidationEntreeSchema,
  demanderValidationSortieSchema,
  getContratEntreeSchema,
  getContratSortieSchema,
  sortieUsage3Schema,
  versJsonSchema,
  type DemanderValidationSortie,
  type GetContratSortie,
  type SchemaZod,
  type SortieUsage3,
} from "../../apps/web/lib/schemas";
import { executerRun, MOTIFS_INTERDITS_PAR_DEFAUT, type ContexteOutil, type OutilLocal } from "./boucle";
import { controlerSortieUsage3 } from "./controle_u3";

const RACINE = path.resolve(__dirname, "../..");

type FixtureU3 = {
  logement_id: string;
  absence: { depart_le: string; retour_le: string };
  assureurs: Record<string, { contrat: Record<string, unknown> | null; controle: { domaines: string[]; url_depart: string } }>;
  otv: { domaines: string[]; url_depart: string };
};

function option(nom: string): string | undefined {
  const index = process.argv.indexOf(`--${nom}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const drapeau = (nom: string) => process.argv.includes(`--${nom}`);

function analyser<T>(schema: SchemaZod<T>, valeur: unknown, quoi: string): T {
  const analyse = schema.safeParse(valeur);
  if (analyse.success) return analyse.data;
  const details = analyse.error.issues
    .map((probleme) => `${probleme.path.join(".") || "(racine)"} : ${probleme.message}`)
    .join(" ; ");
  throw new Error(`${quoi} invalide. ${details}`);
}

async function chargerOutil(nom: string): Promise<OutilHai> {
  const fichier = path.join(RACINE, "agents/schemas/tools", `${nom}.json`);
  return outilHaiSchema.parse(JSON.parse(await readFile(fichier, "utf8")));
}

/** get_contrat : seulement les champs demandés (assureur et formule toujours). Idempotent. */
function creerGetContrat(fixture: FixtureU3, cle: string) {
  return async (args: Record<string, unknown>): Promise<GetContratSortie> => {
    const { logement_id, champs } = analyser(getContratEntreeSchema, args, "Entrée de get_contrat");
    if (logement_id !== fixture.logement_id) {
      throw new Error(`Logement inconnu : ${logement_id}. Utilise le logement_id de la consigne.`);
    }
    const permis = new Set(["assureur", "formule", "reference_cg", "inoccupation", "absence"]);
    const voulus = new Set(["assureur", "formule", ...champs.filter((champ) => permis.has(champ))]);
    const contrat = fixture.assureurs[cle].contrat;
    // Parcours sans contrat : même erreur que la route serveur, l'agent continue sans.
    if (!contrat) throw new Error("Aucun contrat pour ce logement.");
    const reponse = Object.fromEntries(Object.entries(contrat).filter(([champ]) => voulus.has(champ)));
    return analyser(getContratSortieSchema, reponse, "Fixture de get_contrat");
  };
}

/**
 * Question dans le terminal. Quelle que soit la réponse, RIEN n'est envoyé : l'agent n'a
 * aucun identifiant, et la consigne renvoyée lui dit de s'arrêter.
 */
async function demanderValidation(
  args: Record<string, unknown>,
  { signal }: ContexteOutil,
): Promise<DemanderValidationSortie> {
  const demande = analyser(demanderValidationEntreeSchema, args, "Entrée de demander_validation");

  console.log("\n\x07════════ VALIDATION DEMANDÉE PAR L'AGENT ════════");
  console.log(`Action   : ${demande.action}`);
  console.log(`Résumé   : ${demande.resume}`);
  console.log(`URL      : ${demande.url ?? "(non précisée)"}`);
  console.log("Rien n'est envoyé : l'utilisateur se connecte et envoie lui-même.");

  let saisie = "";
  if (process.stdin.isTTY) {
    const lecteur = createInterface({ input: process.stdin, output: process.stdout });
    lecteur.on("SIGINT", () => process.emit("SIGINT", "SIGINT"));
    try {
      saisie = await lecteur.question("Tape « approuve » pour approuver (Entrée seule = REFUS) : ", { signal });
    } finally {
      lecteur.close();
    }
  } else {
    console.log("Pas de terminal interactif : REFUS par défaut.");
  }

  const approuve = saisie.trim().toLowerCase() === "approuve";
  console.log(approuve ? "→ APPROUVÉ (l'utilisateur enverra lui-même).\n" : "→ REFUSÉ.\n");
  return analyser(
    demanderValidationSortieSchema,
    {
      decision: approuve ? "approuve" : "refuse",
      message: approuve
        ? "Récapitulatif validé. L'utilisateur se connectera et enverra lui-même. Ne fais plus aucune action dans le navigateur, ne remplis et n'envoie rien, et rends ta réponse finale maintenant."
        : "Refusé par l'utilisateur. Ne fais plus aucune action dans le navigateur, n'envoie rien, et rends ta réponse finale maintenant.",
    },
    "Sortie de demander_validation",
  );
}

/** Format affiché à l'agent : 15/12/2026. */
function dateFr(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  return `${jour}/${mois}/${annee}`;
}

async function main(): Promise<void> {
  const fixture = JSON.parse(
    await readFile(path.join(RACINE, "agents/dev/fixtures/contrat_u3.json"), "utf8"),
  ) as FixtureU3;
  const cle = (option("assureur") ?? "").toLowerCase();
  const assureur = fixture.assureurs[cle];
  if (!assureur) {
    throw new Error(`Indique l'assureur : npm run agent:u3 -- --assureur <${Object.keys(fixture.assureurs).join("|")}>`);
  }

  // Ce que /api/absence calcule pour cette absence (même fonction).
  const contrat = assureur.contrat ? getContratSortieSchema.parse(assureur.contrat) : null;
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const absence = evaluerAbsence({ ...fixture.absence, inoccupation: contrat?.inoccupation }, aujourdhui);
  console.log(
    `Absence ${fixture.absence.depart_le} → ${fixture.absence.retour_le} : ${absence.duree_jours} jours, seuil ${absence.seuil_jours ?? "aucun"} → informer l'assureur : ${absence.informer_assureur ? "oui" : "non"} ; fenêtre OTV ${absence.otv.ouverture_le} → ${absence.otv.limite_le} (${absence.otv.delai_ok ? "ouverte" : absence.otv.trop_tot ? "pas encore ouverte" : "fermée"}).`,
  );
  if (drapeau("verifier-absence")) {
    console.log(JSON.stringify(absence, null, 2));
    return;
  }

  const gabarit = await readFile(path.join(RACINE, "agents/dev/prompt_u3_provisoire.md"), "utf8");
  const prompt = gabarit
    .replace(/<!--[\s\S]*?-->/g, "")
    .replaceAll("{{LOGEMENT_ID}}", fixture.logement_id)
    .replaceAll("{{DEPART}}", dateFr(fixture.absence.depart_le))
    .replaceAll("{{RETOUR}}", dateFr(fixture.absence.retour_le))
    .replaceAll("{{DUREE}}", String(absence.duree_jours))
    .trim();

  const outils: OutilLocal[] = [
    { declaration: await chargerOutil("get_contrat"), executer: creerGetContrat(fixture, cle) },
    { declaration: await chargerOutil("demander_validation"), executer: demanderValidation, validation: true },
  ];

  // Coupe-circuit de l'usage 3 : toute page FranceConnect, OAuth ou d'espace adhérent annule la
  // session (les mots sont comparés sans accents). « inscription » est retiré : les pages
  // publiques de l'OTV peuvent le porter dans leur adresse (« inscription à l'OTV »), alors
  // que la connexion qui la précède est couverte par franceconnect, login, connexion, compte.
  const motifsInterdits = {
    stricts: [
      ...MOTIFS_INTERDITS_PAR_DEFAUT.stricts.filter((motif) => motif !== "inscription"),
      "franceconnect",
      "authorize",
      "oauth",
      "adherent",
      "societaire",
    ],
    tunnel: MOTIFS_INTERDITS_PAR_DEFAUT.tunnel,
  };

  // Agent maison créé sur H (agents/definitions/), figé sur sa révision.
  const agent = option("agent") ?? "chez-soi-demarches:1";
  console.log(`Usage 3 · démarches avant absence · assureur : ${cle} · agent : ${agent}`);
  const resultat = await executerRun<SortieUsage3>({
    usage: "u3",
    agent,
    prompt,
    outils,
    schemaSortie: sortieUsage3Schema,
    formatReponse: versJsonSchema(sortieUsage3Schema),
    controlerSortie: (sortie) =>
      controlerSortieUsage3(sortie, {
        domainesOtv: fixture.otv.domaines,
        domainesAssureur: assureur.controle.domaines,
        depart_le: fixture.absence.depart_le,
        retour_le: fixture.absence.retour_le,
        duree_jours: absence.duree_jours,
        seuil_jours: absence.seuil_jours,
        sources_absence: (contrat?.absence ?? []).map((clause) => clause.source),
      }),
    site: `${new URL(fixture.otv.url_depart).hostname} + ${new URL(assureur.controle.url_depart).hostname}`,
    urlDepart: fixture.otv.url_depart,
    dossierRuns: path.join(RACINE, "agents/bench/runs"),
    motifsInterdits,
    aBlanc: drapeau("a-blanc"),
    malgreSessionsActives: drapeau("malgre-sessions-actives"),
  });
  if (!resultat) return;

  const { run, sortie } = resultat;
  console.log("\n──────── Résultat ────────");
  console.log(`État final : ${run.etat_final} · outcome : ${run.outcome ?? "aucun"} · error_code : ${run.error_code ?? "aucun"}`);
  console.log(`Fin : ${run.motif_fin} · durée : ${run.duree_s} s · étapes : ${run.nb_etapes} · validation : ${run.decision_validation ?? "non demandée"}`);
  console.log(`Schéma : ${run.schema_valide ? "conforme" : "NON conforme"}`);
  run.erreurs_schema.forEach((erreur) => console.log(`  - ${erreur}`));
  if (sortie) console.log(JSON.stringify(sortie, null, 2));
  console.log(`Écarts métier : ${run.ecarts_metier.length === 0 ? "aucun" : ""}`);
  run.ecarts_metier.forEach((ecart) => console.log(`  - ${ecart}`));
}

main()
  .then(() => process.exit(0))
  .catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
