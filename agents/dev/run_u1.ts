/**
 * Run local de l'usage 1 (sourcing, issue #7) : l'agent retrouve sur le site public de
 * l'assureur les conditions générales du contrat fictif de Jeanne et renvoie leur URL.
 * Le code télécharge ensuite le PDF et contrôle lui-même la référence.
 * Lecture seule : aucune connexion, aucun formulaire, aucun compte. Pas de demander_validation.
 *
 * Depuis apps/web/ :  npm run agent:u1 -- --assureur <maif|altima>
 * Options : --a-blanc (n'envoie rien), --agent <nom[:N]>, --malgre-sessions-actives,
 *           --sans-url-depart (l'agent part d'une page vierge au lieu du site de l'assureur),
 *           --controler-url <url> (contrôle un PDF sans lancer de session, pour tester le code)
 *
 * UNE session par lancement, jamais de relance automatique.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { outilHaiSchema, type OutilHai } from "../../apps/web/lib/hai";
import {
  getContratEntreeSchema,
  getContratSortieSchema,
  sortieUsage1Schema,
  versJsonSchema,
  type GetContratSortie,
  type SchemaZod,
  type SortieUsage1,
} from "../../apps/web/lib/schemas";
import { executerRun, type OutilLocal } from "./boucle";
import { controlerSortieUsage1 } from "./controle";
import { controlerDocument } from "./pdf_cg";

const RACINE = path.resolve(__dirname, "../..");
const DOSSIER_PDF = path.join(RACINE, "agents/bench/pdf");

type FixtureU1 = {
  logement_id: string;
  assureurs: Record<
    string,
    {
      contrat: Record<string, unknown>;
      controle: { domaines: string[]; url_depart: string; reference_attendue: string };
    }
  >;
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

/**
 * get_contrat : ne renvoie que les champs demandés, jamais le PDF, l'adresse ni le numéro de
 * contrat. `assureur` et `formule` sont toujours renvoyés (obligatoires dans le contrat
 * d'interface). Idempotent : même entrée, même sortie.
 */
function creerGetContrat(fixture: FixtureU1, cle: string) {
  return async (args: Record<string, unknown>): Promise<GetContratSortie> => {
    const { logement_id, champs } = analyser(getContratEntreeSchema, args, "Entrée de get_contrat");
    if (logement_id !== fixture.logement_id) {
      throw new Error(`Logement inconnu : ${logement_id}. Utilise le logement_id de la consigne.`);
    }
    const contrat = fixture.assureurs[cle].contrat;
    const permis = new Set(["assureur", "formule", "reference_cg", "inoccupation"]);
    const voulus = new Set(["assureur", "formule", ...champs.filter((champ) => permis.has(champ))]);
    const reponse = Object.fromEntries(Object.entries(contrat).filter(([champ]) => voulus.has(champ)));
    return analyser(getContratSortieSchema, reponse, "Fixture de get_contrat");
  };
}

async function main(): Promise<void> {
  const fixture = JSON.parse(
    await readFile(path.join(RACINE, "agents/dev/fixtures/contrat_u1.json"), "utf8"),
  ) as FixtureU1;
  const cle = (option("assureur") ?? "").toLowerCase();
  const assureur = fixture.assureurs[cle];
  if (!assureur) {
    throw new Error(
      `Indique l'assureur : npm run agent:u1 -- --assureur <${Object.keys(fixture.assureurs).join("|")}>`,
    );
  }
  const { controle } = assureur;

  // Mode test du contrôle, sans session H.
  const urlATester = option("controler-url");
  if (urlATester) {
    const resultat = await controlerDocument({
      url: urlATester,
      domaines: controle.domaines,
      referenceAttendue: controle.reference_attendue,
      dossierPdf: DOSSIER_PDF,
      prefixe: `test_${cle}`,
    });
    console.log(JSON.stringify(resultat, null, 2));
    return;
  }

  const gabarit = await readFile(path.join(RACINE, "agents/dev/prompt_u1_provisoire.md"), "utf8");
  const prompt = gabarit
    .replace(/<!--[\s\S]*?-->/g, "")
    .replaceAll("{{LOGEMENT_ID}}", fixture.logement_id)
    .trim();

  const outils: OutilLocal[] = [
    { declaration: await chargerOutil("get_contrat"), executer: creerGetContrat(fixture, cle) },
  ];

  const urlDepart = drapeau("sans-url-depart") ? undefined : controle.url_depart;
  // Agent maison créé sur H (agents/definitions/), figé sur sa révision.
  const agent = option("agent") ?? "chez-soi-sourcing:1";
  const site = new URL(controle.url_depart).hostname;
  console.log(`Usage 1 · conditions générales · assureur : ${cle} · départ : ${urlDepart ?? "page vierge"} · agent : ${agent}`);

  const resultat = await executerRun<SortieUsage1>({
    usage: "u1",
    agent,
    prompt,
    outils,
    schemaSortie: sortieUsage1Schema,
    formatReponse: versJsonSchema(sortieUsage1Schema),
    controlerSortie: (sortie) =>
      controlerSortieUsage1(sortie, { domaines: controle.domaines, reference: controle.reference_attendue }),
    site,
    urlDepart,
    dossierRuns: path.join(RACINE, "agents/bench/runs"),
    aBlanc: drapeau("a-blanc"),
    malgreSessionsActives: drapeau("malgre-sessions-actives"),
  });
  if (!resultat) return;

  const { run, sortie, fichier } = resultat;
  console.log("\n──────── Résultat de l'agent ────────");
  console.log(`État final : ${run.etat_final} · outcome : ${run.outcome ?? "aucun"} · error_code : ${run.error_code ?? "aucun"}`);
  console.log(`Fin : ${run.motif_fin} · durée : ${run.duree_s} s · étapes : ${run.nb_etapes}`);
  console.log(`Schéma : ${run.schema_valide ? "conforme" : "NON conforme"}`);
  run.erreurs_schema.forEach((erreur) => console.log(`  - ${erreur}`));
  if (sortie) console.log(JSON.stringify(sortie, null, 2));
  console.log(`Écarts métier : ${run.ecarts_metier.length === 0 ? "aucun" : ""}`);
  run.ecarts_metier.forEach((ecart) => console.log(`  - ${ecart}`));

  // Contrôle par le code : téléchargement et référence. Écrit dans le fichier du run.
  if (sortie?.trouve && sortie.url_cg) {
    console.log("\n──────── Contrôle du document par le code ────────");
    const controleDocument = await controlerDocument({
      url: sortie.url_cg,
      domaines: controle.domaines,
      referenceAttendue: controle.reference_attendue,
      dossierPdf: DOSSIER_PDF,
      prefixe: `${run.debut.slice(0, 10)}_${cle}`,
    });
    console.log(JSON.stringify(controleDocument, null, 2));
    const enregistre = JSON.parse(await readFile(fichier, "utf8")) as Record<string, unknown>;
    enregistre.controle_document = controleDocument;
    await writeFile(fichier, `${JSON.stringify(enregistre, null, 2)}\n`);
    const verdict =
      controleDocument.reference === "trouvee"
        ? "BON DOCUMENT : référence retrouvée dans le PDF."
        : controleDocument.reference === "non_verifiable"
          ? "PDF téléchargé, référence NON VÉRIFIABLE par ce contrôle : à vérifier à la main ou par Docling."
          : `ÉCHEC : ${controleDocument.erreur ?? "référence absente du PDF"}`;
    console.log(verdict);
  }
  console.log(`\nRun enregistré : ${path.relative(RACINE, fichier)}`);
}

main()
  .then(() => process.exit(0))
  .catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
