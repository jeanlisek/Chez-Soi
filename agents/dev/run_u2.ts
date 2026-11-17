/**
 * Run local de l'usage 2 (objets) : sous-tapis antidérapant pour un tapis de 60 × 160 cm,
 * persona fictive Jeanne. Arrêt au panier : aucune connexion, aucun paiement, aucune commande.
 *
 * Depuis apps/web/ :  npm run agent:u2 -- --site <domaine>
 * Options : --a-blanc (n'envoie rien), --agent <nom[:N]>, --malgre-sessions-actives
 *
 * UNE session par lancement, jamais de relance automatique.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { HAI_AGENT, outilHaiSchema, type OutilHai } from "../../apps/web/lib/hai";
import {
  CHAMPS_ATTENDUS_USAGE_2,
  demanderValidationEntreeSchema,
  demanderValidationSortieSchema,
  getMesuresEntreeSchema,
  getMesuresSortieSchema,
  sortieUsage2Schema,
  versJsonSchema,
  type DemanderValidationSortie,
  type GetMesuresSortie,
  type SchemaZod,
  type SortieUsage2,
} from "../../apps/web/lib/schemas";
import { executerRun, type ContexteOutil, type OutilLocal } from "./boucle";

const RACINE = path.resolve(__dirname, "../..");
const FAILLE_ID = "faille-demo-tapis-01";

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
  return analyser(getMesuresSortieSchema, mesures, "Fixture de get_mesures");
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
            "Refusé par l'utilisateur. Ne fais plus aucune action dans le navigateur, ne commande rien, et rends ta réponse finale maintenant.",
        },
    "Sortie de demander_validation",
  );
}

/** Écarts signalés, jamais corrigés : l'outcome de l'agent est une auto-évaluation. */
function controlerSortie(sortie: SortieUsage2): string[] {
  if (!sortie.trouve) return [];
  const ecarts: string[] = CHAMPS_ATTENDUS_USAGE_2.filter((champ) => sortie[champ] === undefined).map(
    (champ) => `${champ} : absent alors que trouve est vrai`,
  );
  const dimensions = sortie.dimensions;
  if (dimensions) {
    const [petit, grand] = [dimensions.largeur_cm, dimensions.longueur_cm].sort((a, b) => a - b);
    if (petit > 60 || grand > 160) {
      ecarts.push(
        `dimensions : ${petit} × ${grand} cm dépasse 60 × 160 cm (acceptable seulement si le produit se découpe : à vérifier sur la fiche)`,
      );
    }
  }
  return ecarts;
}

async function main(): Promise<void> {
  const siteBrut = option("site");
  if (!siteBrut) {
    throw new Error("Indique le site marchand : npm run agent:u2 -- --site <domaine>");
  }
  const urlSite = new URL(/^https?:\/\//i.test(siteBrut) ? siteBrut : `https://${siteBrut}`);
  // Un chemin est gardé : pour IKEA France, le site est « www.ikea.com/fr/fr ».
  const site = `${urlSite.hostname}${urlSite.pathname.replace(/\/+$/, "")}`;

  const gabarit = await readFile(path.join(RACINE, "agents/dev/prompt_u2_provisoire.md"), "utf8");
  const prompt = gabarit
    .replace(/<!--[\s\S]*?-->/g, "")
    .replaceAll("{{SITE}}", site)
    .replaceAll("{{FAILLE_ID}}", FAILLE_ID)
    .trim();

  const outils: OutilLocal[] = [
    { declaration: await chargerOutil("get_mesures"), executer: getMesures },
    { declaration: await chargerOutil("demander_validation"), executer: demanderValidation, validation: true },
  ];

  console.log(`Usage 2 · sous-tapis 60 × 160 cm · site : ${site} · agent : ${option("agent") ?? HAI_AGENT}`);
  const resultat = await executerRun<SortieUsage2>({
    usage: "u2",
    agent: option("agent") ?? HAI_AGENT,
    prompt,
    outils,
    schemaSortie: sortieUsage2Schema,
    formatReponse: versJsonSchema(sortieUsage2Schema),
    controlerSortie,
    site,
    urlDepart: `${urlSite.origin}${urlSite.pathname}`,
    dossierRuns: path.join(RACINE, "agents/bench/runs"),
    aBlanc: drapeau("a-blanc"),
    malgreSessionsActives: drapeau("malgre-sessions-actives"),
  });
  if (!resultat) return;

  const { run, sortie } = resultat;
  console.log("\n──────── Résultat ────────");
  console.log(`État final : ${run.etat_final} · outcome : ${run.outcome ?? "aucun"} · error_code : ${run.error_code ?? "aucun"}`);
  console.log(`Fin : ${run.motif_fin} · durée : ${run.duree_s} s · étapes : ${run.nb_etapes} · validation : ${run.decision_validation ?? "non demandée"}`);
  if (sortie) {
    console.log("Sortie finale (conforme au schéma Zod) :");
    console.log(JSON.stringify(sortie, null, 2));
  } else {
    console.log("Pas de sortie finale conforme au schéma.");
  }
  if (run.erreurs_sortie.length > 0) {
    console.log("Écarts :");
    run.erreurs_sortie.forEach((ecart) => console.log(`  - ${ecart}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
