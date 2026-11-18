# agents/

Prompts, schémas d'outils, skill, scripts locaux et banc de mesure de l'agent H.

## Ce qui existe

- `schemas/tools/` : déclarations des custom tools au format de la doc H, soit exactement `{ name, description, input_schema }` ([custom tools](https://hub.hcompany.ai/agents-api/custom-tools.md)). `get_mesures` et `demander_validation` sont à ce format. `get_contrat.json` garde un `output_schema` hérité du squelette : il sera aligné avec l'issue #7.
- La sortie des outils n'est pas déclarée à H : elle est décrite en Zod dans `apps/web/lib/schemas.ts`, avec les entrées. Toute modification du contrat d'interface se fait des deux côtés.
- `dev/` : scripts locaux, sans webhook ni Supabase.
  - `boucle.ts` : module commun à tous les usages. Il vérifie le quota, crée une session, suit `/status` et `/changes`, sert les outils, applique les délais et le coupe-circuit, annule sur Ctrl+C, enregistre le run.
  - `run_u2.ts` : usage 2, sous-tapis antidérapant pour un tapis de 60 × 160 cm, persona fictive Jeanne.
  - `controle.ts` : contrôle de la réponse finale. `schema_valide` dit si elle respecte le schéma Zod (`null` et chaîne vide valent « absent ») ; `ecarts_metier` liste ce qu'il reste à vérifier (champ attendu absent, dimension qui dépasse la cote). La réponse brute de l'agent est enregistrée telle que reçue.
  - `recontroler.ts` : repasse ce contrôle sur les runs déjà enregistrés, sans appeler H (`npm run agent:recontroler`).
  - `prompt_u2_provisoire.md` : prompt provisoire. Les prompts définitifs sont dans `prompts/` (issue #6).
  - `fixtures/` : données fictives servies par les outils.
- `bench/runs/` : un fichier JSON par run, au futur format de `runs_agent` (`runAgentSchema` dans `apps/web/lib/schemas.ts`).
- `prompts/`, `skills/`, `workflows.ts`, `bench/cas_*.json`, `bench/run_bench.py` : amorces.

Le client de l'API est `apps/web/lib/hai.ts`. Il ne contient rien de propre à un usage.

## Lancer un run de l'usage 2

Depuis `apps/web/`, dans un vrai terminal (la validation se fait au clavier) :

```bash
npm run agent:u2 -- --site <domaine>
```

`--a-blanc` affiche la requête sans rien envoyer. Les autres options sont décrites dans la section Commandes du `CLAUDE.md`.

Règles : une seule session H à la fois, annoncée dans le canal ; personas et données fictives uniquement ; aucune connexion, aucun paiement, aucune commande, aucun formulaire envoyé.

## Arrêt au panier : ce qui est garanti, et ce qui ne l'est pas

L'API H n'a **pas de garde-fou natif sur une action du navigateur**. L'approbation native (« Approve or deny ») vise les commandes shell ; un custom tool comme `demander_validation` n'est appelé que si l'agent suit le prompt. L'arrêt avant paiement repose donc sur :

1. **L'absence de moyens** : l'agent ne reçoit ni identifiant, ni moyen de paiement, ni adresse, ni coffre-fort.
2. **Le prompt** : interdiction d'entrer dans le tunnel de commande, appel obligatoire de `demander_validation` une fois le panier affiché.
3. **Le code de `boucle.ts`** :
   - refus par défaut à la validation (Entrée seule = refus) ;
   - après la réponse, la session a 60 s pour finir, puis elle est annulée ;
   - délai global de 10 minutes, et `max_time_s: 600` côté serveur si le script meurt ;
   - **coupe-circuit** : l'API expose les pages vues (`observation_event.metadata.url`) et les actions choisies (`policy_event.tool_reqs`) dans les événements de `/changes`. Dès qu'une de ces URL contient un mot comme `checkout`, `paiement`, `payment`, `commande`, `order`, `livraison`, `login`, `connexion`, `compte` ou `account`, la session est annulée.

Vu au premier run (18/11) : l'agent peut émettre un custom tool et une action du navigateur **dans la même étape**, et l'action s'exécute sans attendre le résultat de l'outil. Appeler `demander_validation` ne suspend donc pas, à lui seul, un clic émis en même temps.

Limite du coupe-circuit : il réagit **après coup**, quelques secondes au plus après la page vue. Il n'empêche pas le clic. Il ne voit pas non plus un tunnel de commande qui s'ouvrirait sans changer d'URL (fenêtre modale). Une page panier rangée sous `/checkout/cart` ou `/commande/panier` est tolérée ; un paramètre de tri (`?order=prix`) ou une recherche ne déclenchent rien.

## Dimension : la skill `verifier_dimension` (issue #15)

Aux deux premiers runs, l'agent a retenu un produit plus grand que le tapis (67,5 × 200 cm pour 60 × 160 cm) en le disant découpable. C'était vrai sur la fiche, mais **rien dans sa réponse ne le prouvait**.

- `skills/verifier_dimension.md` : skill maison (`name: verifier-dimension`). Dimensions lues sur la fiche ; dimension absente, produit refusé ; produit plus grand que la cote accepté **seulement** avec une phrase de la fiche, recopiée mot pour mot, qui dit qu'il se découpe (`citation_decoupe`).
- `citation_decoupe` est dans `sortieUsage2Schema` et dans le prompt provisoire de l'usage 2.
- Le code applique la même règle (`ecartDecoupe` dans `dev/controle.ts`) : produit plus grand sans citation, ou avec une citation qui ne parle pas de découpe, signalé « à REFUSER » dans `ecarts_metier`. Le code ne relit pas la fiche : que la citation figure bien sur la page se vérifie dans le replay.
- Publication : `npm run agent:skill -- ../../agents/skills/verifier_dimension.md` (à blanc), puis `--publier`. Elle crée la révision 1 ; on fige ensuite les runs avec `--skill verifier-dimension:N`.
- **Non vérifié** : la doc H ne cite pas `agent.skills` parmi les chemins de `overrides`. Un chemin inconnu renvoie 422 sans créer de session ; et une surcharge remplace la liste, donc les skills d'origine de l'agent pourraient sauter. À tester une fois et à noter dans l'onglet Retours Agent API.

## Ce que l'usage 1 réutilisera (issue #7)

Tels quels : `apps/web/lib/hai.ts`, `dev/boucle.ts` (quota, création, suivi, cache des outils, coupe-circuit, délais, annulation, enregistrement dans `bench/runs/`) et `evaluerSortie` de `dev/controle.ts`.

À ajouter par `dev/run_u1.ts` : `get_contrat.json` au format de la doc H, une fixture de contrat fictif, un prompt provisoire, le schéma de sortie `{ trouve, url_cg, … }` dans `schemas.ts`, puis le téléchargement du PDF et le contrôle de la référence par le code. Pas d'outil de validation : l'usage 1 est en lecture seule.
