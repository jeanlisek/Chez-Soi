/**
 * Publie une skill maison sur H (issue #15) : `POST /api/v2/skills`, qui crée la révision 1.
 * https://hub.hcompany.ai/agents-api/skills/create.md
 *
 * Depuis apps/web/ :
 *   npm run agent:skill -- ../../agents/skills/verifier_dimension.md            (à blanc : affiche le corps, n'envoie rien)
 *   npm run agent:skill -- ../../agents/skills/verifier_dimension.md --publier  (crée la skill sur le compte de l'équipe)
 *
 * Le fichier porte un bloc `---` avec `name` et `description` ; le reste est le `body`.
 * Les commentaires HTML sont retirés. Une skill existante (409) n'est pas écrasée : une
 * nouvelle révision se fait depuis la console H, puis on fige la démo sur `nom:N`.
 * Ne lance aucune session et ne consomme aucun token d'agent.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { HAI_API_URL } from "../../apps/web/lib/hai";

type Skill = { name: string; description: string; body: string };

export function lireSkill(texte: string): Skill {
  const sansCommentaires = texte.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n").trim();
  const bloc = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(sansCommentaires);
  if (!bloc) throw new Error("Bloc --- name / description introuvable en tête du fichier.");
  const [, entete, body] = bloc;
  const champ = (nom: string) => new RegExp(`^${nom}:\\s*(.+)$`, "m").exec(entete)?.[1]?.trim();
  const name = champ("name");
  const description = champ("description");
  if (!name || !/^([a-z0-9]+(-[a-z0-9]+)*\/)?[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`name invalide : « ${name ?? ""} » (kebab-case, préfixe org/ facultatif).`);
  }
  if (name.startsWith("h/")) throw new Error("Le préfixe h/ est réservé au catalogue de H.");
  if (!description) throw new Error("description absente.");
  if (!body.trim()) throw new Error("body vide.");
  return { name, description, body: body.trim() };
}

async function main(): Promise<void> {
  const fichier = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!fichier) throw new Error("Indique le fichier de la skill, par exemple ../../agents/skills/verifier_dimension.md");
  const skill = lireSkill(await readFile(path.resolve(fichier), "utf8"));

  if (!process.argv.includes("--publier")) {
    console.log("À blanc : voici le corps de POST /skills, rien n'est envoyé (ajoute --publier).");
    console.log(JSON.stringify(skill, null, 2));
    return;
  }

  const cle = process.env.H_API_KEY;
  if (!cle) throw new Error("H_API_KEY absente : mets-la dans le .env de la racine du dépôt.");
  const message = encodeURIComponent(`Publiée depuis ${path.basename(fichier)}`);
  const reponse = await fetch(`${HAI_API_URL}/skills?message=${message}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify(skill),
  });
  const texte = await reponse.text();
  if (reponse.status === 409) {
    throw new Error(`La skill ${skill.name} existe déjà : nouvelle révision depuis la console H, puis --skill ${skill.name}:N.`);
  }
  if (!reponse.ok) throw new Error(`POST /skills : HTTP ${reponse.status}. ${texte.slice(0, 500)}`);
  console.log(`Skill ${skill.name} créée (révision ${(reponse.headers.get("etag") ?? "1").replaceAll('"', "")}).`);
  console.log(`À utiliser figée : npm run agent:u2 -- --site <domaine> --skill ${skill.name}:1`);
}

if (require.main === module) {
  main().catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
}
