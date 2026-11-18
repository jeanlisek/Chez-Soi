/**
 * Crée ou met à jour un agent maison sur H à partir d'un fichier de `agents/definitions/`.
 * https://hub.hcompany.ai/agents-api/agents/create.md  (POST /agents, révision 1)
 * https://hub.hcompany.ai/agents-api/agents/update.md  (PUT /agents/{nom}, remplacement complet, If-Match)
 *
 * Depuis apps/web/ :
 *   npm run agent:creer -- ../../agents/definitions/chez-soi-acheteur.json                     (à blanc)
 *   npm run agent:creer -- ../../agents/definitions/chez-soi-acheteur.json --publier           (crée, révision 1)
 *   npm run agent:creer -- ../../agents/definitions/chez-soi-acheteur.json --publier --mettre-a-jour
 *                                                                (nouvelle révision ; les runs figés sur nom:N ne bougent pas)
 * Ne lance aucune session.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { HAI_API_URL, outilHaiSchema } from "../../apps/web/lib/hai";

const RACINE = path.resolve(__dirname, "../..");
const CHAMPS_H = ["name", "description", "environments", "model", "reasoning_effort", "instructions", "skills", "subagents", "answer_format", "tools"];

export async function construireAgent(fichier: string): Promise<Record<string, unknown>> {
  const definition = JSON.parse(await readFile(fichier, "utf8")) as Record<string, unknown>;
  const corps: Record<string, unknown> = Object.fromEntries(
    Object.entries(definition).filter(([cle]) => CHAMPS_H.includes(cle)),
  );
  const outils = (definition.outils as string[] | undefined) ?? [];
  if (outils.length) {
    corps.tools = await Promise.all(
      outils.map(async (nom) =>
        outilHaiSchema.parse(JSON.parse(await readFile(path.join(RACINE, "agents/schemas/tools", `${nom}.json`), "utf8"))),
      ),
    );
  }
  const nom = String(corps.name ?? "");
  if (!/^([a-z0-9]+(-[a-z0-9]+)*\/)?[a-z0-9]+(-[a-z0-9]+)*$/.test(nom) || nom.startsWith("h/")) {
    throw new Error(`name invalide : « ${nom} » (kebab-case, préfixe org/ facultatif, h/ réservé).`);
  }
  if (!corps.description) throw new Error("description absente.");
  if (!Array.isArray(corps.environments)) throw new Error("environments absent.");
  return corps;
}

async function main(): Promise<void> {
  const fichier = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!fichier) throw new Error("Indique la définition, par exemple ../../agents/definitions/chez-soi-acheteur.json");
  const corps = await construireAgent(path.resolve(fichier));

  if (!process.argv.includes("--publier")) {
    console.log("À blanc : voici le corps envoyé à H, rien n'est envoyé (ajoute --publier).");
    console.log(JSON.stringify(corps, null, 2));
    return;
  }

  const cle = process.env.H_API_KEY;
  if (!cle) throw new Error("H_API_KEY absente : mets-la dans le .env de la racine du dépôt.");
  const entetes = { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };
  const nom = String(corps.name);
  const message = encodeURIComponent(`Depuis ${path.basename(fichier)}`);

  let reponse: Response;
  if (process.argv.includes("--mettre-a-jour")) {
    const actuel = await fetch(`${HAI_API_URL}/agents/${nom}`, { headers: entetes });
    if (!actuel.ok) throw new Error(`GET /agents/${nom} : HTTP ${actuel.status}`);
    reponse = await fetch(`${HAI_API_URL}/agents/${nom}?message=${message}`, {
      method: "PUT",
      headers: { ...entetes, "If-Match": actuel.headers.get("etag") ?? "*" },
      body: JSON.stringify(corps),
    });
  } else {
    reponse = await fetch(`${HAI_API_URL}/agents?message=${message}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify(corps),
    });
    if (reponse.status === 409) throw new Error(`L'agent ${nom} existe déjà : relance avec --mettre-a-jour.`);
  }
  const texte = await reponse.text();
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}. ${texte.slice(0, 600)}`);
  const revision = (reponse.headers.get("etag") ?? "?").replaceAll('"', "");
  console.log(`Agent ${nom} enregistré, révision ${revision}.`);
  console.log(`À utiliser figé : npm run agent:u2 -- --site <domaine> --agent ${nom}:${revision}`);
}

if (require.main === module) {
  main().catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
}
