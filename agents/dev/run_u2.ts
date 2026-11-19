/**
 * Run local de l'usage 2 (objets) : sous-tapis antidérapant pour un tapis de 60 × 160 cm,
 * persona fictive Jeanne. Arrêt au panier : aucune connexion, aucun paiement, aucune commande.
 *
 * Depuis apps/web/ :  npm run agent:u2 -- --site <domaine>
 * Options : --a-blanc (n'envoie rien), --agent <nom[:N]>, --malgre-sessions-actives
 *
 * UNE session par lancement, jamais de relance automatique.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { HAI_AGENT, outilHaiSchema, type OutilHai } from "../../apps/web/lib/hai";
import {
  demanderValidationEntreeSchema,
  demanderValidationSortieSchema,
  getMesuresEntreeSchema,
  getMesuresSortieSchema,
  versJsonSchema,
  type DemanderValidationSortie,
  type GetMesuresSortie,
  type SchemaZod,
} from "../../apps/web/lib/schemas";
import { executerRun, type ContexteOutil, type OutilLocal } from "./boucle";
import { controlerSortieUsage2 } from "./controle";
import { ecartsCitationFiche } from "./fiche";
import { creerPilotage } from "./pilotage";
import { sortieUsage2BancSchema, type SortieUsage2Banc } from "../bench/schema_u2";

const RACINE = path.resolve(__dirname, "../..");
const FAILLE_ID = "faille-demo-tapis-01";
let mesuresLues = false;
let dernierePreuve: Record<string, unknown> | null = null;
const executerFichier = promisify(execFile);

function option(nom: string): string | undefined {
  const index = process.argv.indexOf(`--${nom}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const drapeau = (nom: string) => process.argv.includes(`--${nom}`);

/** Valide une entrée ou une sortie d'outil ; l'erreur est lisible par l'agent. */
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

async function getMesures(args: Record<string, unknown>): Promise<GetMesuresSortie> {
  const { faille_id } = analyser(getMesuresEntreeSchema, args, "Entrée de get_mesures");
  const fixture = JSON.parse(
    await readFile(path.join(RACINE, "agents/dev/fixtures/mesures_u2.json"), "utf8"),
  ) as { failles: Record<string, unknown> };
  const mesures = fixture.failles[faille_id];
  if (!mesures) throw new Error(`Faille inconnue : ${faille_id}. Utilise le faille_id de la consigne.`);
  const resultat = analyser(getMesuresSortieSchema, mesures, "Fixture de get_mesures");
  mesuresLues = true;
  return resultat;
}

async function lireFicheProduit(args: Record<string, unknown>) {
  if (!mesuresLues) throw new Error("Appelle get_mesures seul avant de lire une fiche.");
  if (typeof args.url !== "string") throw new Error("url HTTPS de la fiche requise");
  const { stdout } = await executerFichier("python3", [path.join(RACINE, "agents/bench/lire_fiche.py"), args.url],
    { timeout: 25_000, maxBuffer: 300_000 });
  dernierePreuve = JSON.parse(stdout) as Record<string, unknown>;
  return dernierePreuve;
}

/** Question dans le terminal. Entrée seule = REFUS ; il faut taper « approuve ». */
async function demanderValidation(
  args: Record<string, unknown>,
  { signal }: ContexteOutil,
): Promise<DemanderValidationSortie> {
  const demande = analyser(demanderValidationEntreeSchema, args, "Entrée de demander_validation");

  console.log("\n\x07════════ VALIDATION DEMANDÉE PAR L'AGENT ════════");
  console.log(`Action   : ${demande.action}`);
  console.log(`Résumé   : ${demande.resume}`);
  console.log(`Produit  : ${demande.produit ?? "(non précisé)"}`);
  console.log(`Montant  : ${demande.montant_eur === undefined ? "(non précisé)" : `${demande.montant_eur} €`}`);
  console.log(`URL      : ${demande.url ?? "(non précisée)"}`);
  console.log("Rien n'est commandé : quelle que soit ta réponse, la session s'arrête au panier.");

  let saisie = "";
  if (drapeau("refuser-validation")) {
    console.log("Banc : refus explicite, aucune poursuite autorisée.");
  } else if (process.stdin.isTTY) {
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
  console.log(approuve ? "→ APPROUVÉ (le test s'arrête quand même au panier).\n" : "→ REFUSÉ.\n");
  return analyser(
    demanderValidationSortieSchema,
    approuve
      ? {
          decision: "approuve",
          message:
            "Validation enregistrée. La mission s'arrête ici : ne fais plus aucune action dans le navigateur, n'ouvre pas le tunnel de commande, et rends ta réponse finale maintenant.",
        }
      : {
          decision: "refuse",
          message:
            "Refusé par l'utilisateur. Ne fais plus aucune action dans le navigateur, ne commande rien, et rends ta réponse finale maintenant." +
            (dernierePreuve ? " La dernière fiche lue a fourni les valeurs exactes suivantes (source_url identifie la référence ; ne les rapporte que pour cette référence). Copie ces chaînes sans reformulation dans les champs correspondants : " + JSON.stringify({source_url:dernierePreuve.url,produit:dernierePreuve.nom_source,citation_decoupe:dernierePreuve.citation_decoupe_source,citation_dimensions:dernierePreuve.citation_dimensions_source}) + ". Le champ delai_livraison doit être présent, avec non indiquée avant commande si le délai est inconnu." : ""),
        },
    "Sortie de demander_validation",
  );
}

async function main(): Promise<void> {
  const siteBrut = option("site");
  if (!siteBrut) {
    throw new Error("Indique le site marchand : npm run agent:u2 -- --site <domaine>");
  }
  const urlSite = new URL(/^https?:\/\//i.test(siteBrut) ? siteBrut : `https://${siteBrut}`);
  // Un chemin est gardé : pour IKEA France, le site est « www.ikea.com/fr/fr ».
  const site = `${urlSite.hostname}${urlSite.pathname.replace(/\/+$/, "")}`;

  const gabarit = await readFile(path.join(RACINE, "agents/prompts/u2_recommandation.md"), "utf8");
  const prompt = gabarit
    .replace(/<!--[\s\S]*?-->/g, "")
    .replaceAll("{{SITE}}", site)
    .replaceAll("{{CONTEXTE}}", "CAS DE TEST TAPIS UNIQUEMENT : rechercher un sous-tapis antidérapant fin, pour sol dur, pour un tapis de 60 × 160 cm en une pièce ; un format plus petit est admis uniquement si une consigne explicite le demande. Les cotes au sol sont largeur_cm=60 et longueur_cm=160 ; hauteur_cm désigne seulement l’épaisseur, inconnue et donc absente. Ne pas plier ni superposer. Les contraintes plus strictes du cas (ex. découpe interdite) s’appliquent.")
    .replaceAll("{{FAILLE_ID}}", FAILLE_ID)
    .replaceAll("{{CONTRAINTES}}", option("contraintes") ?? "Pas de budget initial ; appliquer les messages reçus pendant le run.")
    .trim();

  const outils: OutilLocal[] = [
    { declaration: await chargerOutil("get_mesures"), executer: getMesures },
    { declaration: await chargerOutil("lire_fiche_produit"), executer: lireFicheProduit },
    { declaration: await chargerOutil("demander_validation"), executer: demanderValidation, validation: true },
  ];

  const pilotage = creerPilotage(option("steer"), Number(option("steer-apres-etape") ?? 3));
  console.log(`Usage 2 · sous-tapis 60 × 160 cm · site : ${site} · agent : ${option("agent") ?? HAI_AGENT}`);
  const resultat = await executerRun<SortieUsage2Banc>({
    usage: "u2",
    agent: option("agent") ?? HAI_AGENT,
    prompt,
    modele: option("modele"),
    surEtatActif: pilotage.surEtatActif,
    outils,
    schemaSortie: sortieUsage2BancSchema,
    formatReponse: versJsonSchema(sortieUsage2BancSchema),
    controlerSortie: controlerSortieUsage2,
    site,
    urlDepart: urlSite.href,
    dossierRuns: path.resolve(option("dossier-runs") ?? path.join(RACINE, "agents/bench/runs")),
    aBlanc: drapeau("a-blanc"),
    masquerLienPrive: drapeau("refuser-validation"),
    malgreSessionsActives: false, // Une seule session pour toute l’organisation, sans dérogation U2.
  });
  if (!resultat) return;

  const { run, sortie } = resultat;
  const ecartsFiche = await ecartsCitationFiche(sortie);
  run.ecarts_metier.push(...ecartsFiche);
  await writeFile(resultat.fichier, JSON.stringify(run, null, 2) + "\n");
  const fichierResultat = option("resultat");
  if (fichierResultat) {
    await mkdir(path.dirname(path.resolve(fichierResultat)), { recursive: true });
    await writeFile(fichierResultat, JSON.stringify({
      fichier_run: resultat.fichier, pilotage: pilotage.trace(),
    }, null, 2) + "\n");
  }
  console.log("\n──────── Résultat ────────");
  console.log(`État final : ${run.etat_final} · outcome : ${run.outcome ?? "aucun"} · error_code : ${run.error_code ?? "aucun"}`);
  console.log(`Fin : ${run.motif_fin} · durée : ${run.duree_s} s · étapes : ${run.nb_etapes} · validation : ${run.decision_validation ?? "non demandée"}`);
  console.log(`Schéma : ${run.schema_valide ? "conforme" : "NON conforme"}`);
  run.erreurs_schema.forEach((erreur) => console.log(`  - ${erreur}`));
  if (sortie) {
    console.log("Sortie finale (normalisée : null et chaîne vide valent absent) :");
    console.log(JSON.stringify(sortie, null, 2));
  }
  console.log(`Écarts métier : ${run.ecarts_metier.length === 0 ? "aucun" : ""}`);
  run.ecarts_metier.forEach((ecart) => console.log(`  - ${ecart}`));
}

main()
  .then(() => process.exit(0))
  .catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
