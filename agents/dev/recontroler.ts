/**
 * Repasse le contrôle de sortie sur les runs déjà enregistrés dans agents/bench/runs/,
 * par exemple après un changement du contrôle. Aucun appel à l'API H, aucune session.
 *
 * Depuis apps/web/ :  npm run agent:recontroler             (lecture seule, affiche le résultat)
 *                     npm run agent:recontroler -- --ecrire  (met à jour les fichiers)
 * Un ou plusieurs chemins de fichiers peuvent être passés ; sinon, tous les runs sont relus.
 *
 * Seuls les champs dérivés du contrôle sont réécrits (`schema_valide`, `erreurs_schema`,
 * `ecarts_metier`, à la place des anciens `sortie_valide` et `erreurs_sortie`). Les données
 * brutes de l'agent (`sortie_finale`, appels d'outils, pages vues…) ne sont jamais touchées.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runAgentSchema, sortieUsage2Schema } from "../../apps/web/lib/schemas";
import { controlerSortieUsage2, evaluerSortie } from "./controle";

const DOSSIER = path.resolve(__dirname, "../bench/runs");
const DERIVES = ["sortie_valide", "erreurs_sortie", "schema_valide", "erreurs_schema", "ecarts_metier"];

async function main(): Promise<void> {
  const ecrire = process.argv.includes("--ecrire");
  const demandes = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const fichiers =
    demandes.length > 0
      ? demandes.map((fichier) => path.resolve(fichier))
      : (await readdir(DOSSIER))
          .filter((nom) => nom.endsWith(".json"))
          .sort()
          .map((nom) => path.join(DOSSIER, nom));

  for (const fichier of fichiers) {
    const texte = await readFile(fichier, "utf8");
    const ancien = JSON.parse(texte) as Record<string, unknown>;
    console.log(`\n${path.basename(fichier)}`);
    if (ancien.usage !== "u2") {
      console.log(`  usage ${String(ancien.usage)} : pas de contrôle écrit pour cet usage, fichier ignoré.`);
      continue;
    }

    const evaluation = evaluerSortie(ancien.sortie_finale, sortieUsage2Schema, controlerSortieUsage2);
    const derives = {
      schema_valide: evaluation.schema_valide,
      erreurs_schema: evaluation.erreurs_schema,
      ecarts_metier: evaluation.ecarts_metier,
    };

    // Même ordre de clés : les champs dérivés prennent la place des anciens.
    const nouveau: Record<string, unknown> = {};
    let places = false;
    for (const [cle, valeur] of Object.entries(ancien)) {
      if (!DERIVES.includes(cle)) nouveau[cle] = valeur;
      else if (!places) {
        Object.assign(nouveau, derives);
        places = true;
      }
    }
    if (!places) Object.assign(nouveau, derives);

    runAgentSchema.parse(nouveau);
    const brutIntact = Object.keys(ancien)
      .filter((cle) => !DERIVES.includes(cle))
      .every((cle) => JSON.stringify(ancien[cle]) === JSON.stringify(nouveau[cle]));
    if (!brutIntact) throw new Error("Une donnée brute aurait été modifiée : rien n'est écrit.");

    console.log(`  schema_valide : ${derives.schema_valide}`);
    derives.erreurs_schema.forEach((erreur) => console.log(`  erreur de schéma : ${erreur}`));
    if (derives.ecarts_metier.length === 0) console.log("  ecarts_metier : aucun");
    derives.ecarts_metier.forEach((ecart) => console.log(`  écart métier : ${ecart}`));

    const nouveauTexte = `${JSON.stringify(nouveau, null, 2)}\n`;
    if (nouveauTexte === texte) console.log("  fichier déjà à jour.");
    else if (ecrire) {
      await writeFile(fichier, nouveauTexte, "utf8");
      console.log("  fichier mis à jour (champs dérivés seulement).");
    } else console.log("  fichier à mettre à jour : relance avec --ecrire.");
  }
}

main().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
