# agents/

Prompts, schémas d'outils, skill, scripts locaux et banc de mesure de l'agent H.

## Ce qui existe

- `schemas/tools/` : déclarations des custom tools au format de la doc H, soit exactement `{ name, description, input_schema }` ([custom tools](https://hub.hcompany.ai/agents-api/custom-tools.md)). `get_mesures`, `get_contrat` et `demander_validation` sont à ce format.
- La sortie des outils n'est pas déclarée à H : elle est décrite en Zod dans `apps/web/lib/schemas.ts`, avec les entrées. Toute modification du contrat d'interface se fait des deux côtés.
- `dev/` : scripts locaux, sans webhook ni Supabase.
  - `boucle.ts` : module commun à tous les usages. Il vérifie le quota, crée une session, suit `/status` et `/changes`, sert les outils, applique les délais et le coupe-circuit, annule sur Ctrl+C, enregistre le run.
  - `run_u1.ts` : usage 1, conditions générales de l'assureur du contrat fictif de Jeanne (issue #7), lecture seule. `pdf_cg.ts` télécharge le PDF et contrôle la référence par le code ; `fixtures/contrat_u1.json` porte le contrat fictif (servi par `get_contrat`) et, à part, ce que le code contrôle (domaines officiels, référence attendue) ; `prompt_u1_provisoire.md` est le prompt provisoire.
  - `run_u2.ts` : usage 2, sous-tapis antidérapant pour un tapis de 60 × 160 cm, persona fictive Jeanne.
  - `run_u3.ts` : usage 3 (issue #14), démarches avant l'absence de Jeanne (35 jours) : liens et récapitulatif pour l'OTV et l'assureur, arrêt sur `demander_validation` (`action: "envoi"`), **rien n'est envoyé**. `controle_u3.ts` contrôle la réponse ; `fixtures/contrat_u3.json` porte la clause d'inoccupation fictive ; `prompt_u3_provisoire.md` est le prompt provisoire.
  - `controle.ts` : contrôle de la réponse finale. `schema_valide` dit si elle respecte le schéma Zod (`null` et chaîne vide valent « absent ») ; `ecarts_metier` liste ce qu'il reste à vérifier (champ attendu absent, dimension qui dépasse la cote). La réponse brute de l'agent est enregistrée telle que reçue.
  - `recontroler.ts` : repasse ce contrôle sur les runs déjà enregistrés, sans appeler H (`npm run agent:recontroler`).
  - `prompt_u2_provisoire.md` : prompt provisoire. Les prompts définitifs sont dans `prompts/` (issue #6).
  - `fixtures/` : données fictives servies par les outils.
- `bench/runs/` : un fichier JSON par run, au futur format de `runs_agent` (`runAgentSchema` dans `apps/web/lib/schemas.ts`).
- `skills/verifier_dimension.md` : skill publiée sur H (`verifier-dimension:2`).
- `prompts/`, `workflows.ts`, `bench/cas_*.json`, `bench/run_bench.py` : amorces du 16/11, gardées pour l'historique. Les consignes en service sont dans `definitions/*.instructions.md` (instructions permanentes) et `apps/web/lib/agent/usages.ts` (consigne de session). Le banc Flash/Pro est dans la PR #32. Résultats mesurés : [`docs/resultats.md`](../docs/resultats.md).

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

Limite du coupe-circuit : il réagit **après coup**, quelques secondes au plus après la page vue. Il n'empêche pas le clic. Il ne voit pas non plus un tunnel de commande qui s'ouvrirait sans changer d'URL (fenêtre modale). Depuis la relecture de Briac (PR #9), il n'y a plus d'exception « panier » : un mot du tunnel de commande (`checkout`, `commande`, `order`, `buy`, `caisse`, `validation`…) dans le chemin coupe la session, même sous `/checkout/cart` ou `/panier/validation`. Les mots stricts (paiement, connexion, compte…) sont aussi cherchés dans les paramètres, mais un paramètre de tri (`?order=prix`) ou une recherche ne déclenchent rien. Dans l'application, l'usage 2 a en plus une **liste blanche** de pages IKEA (accueil, recherche, catégories, fiche produit, panier : `horsCheminsAutorises`) ; toute autre page coupe la session. Pendant l'attente du clic sur `demander_validation`, chaque lecture de l'écran (`GET /api/agent/run`) et la réponse elle-même relisent la session, coupe-circuit compris.

## Dimension : la skill `verifier_dimension` (issue #15)

Aux deux premiers runs, l'agent a retenu un produit plus grand que le tapis (67,5 × 200 cm pour 60 × 160 cm) en le disant découpable. C'était vrai sur la fiche, mais **rien dans sa réponse ne le prouvait**.

- `skills/verifier_dimension.md` : skill maison (`name: verifier-dimension`). Dimensions lues sur la fiche ; dimension absente, produit refusé ; produit plus grand que la cote accepté **seulement** avec une phrase de la fiche, recopiée mot pour mot, qui dit qu'il se découpe (`citation_decoupe`).
- `citation_decoupe` est dans `sortieUsage2Schema` et dans le prompt provisoire de l'usage 2.
- Le code applique la même règle (`ecartDecoupe` dans `dev/controle.ts`) : produit plus grand sans citation, ou avec une citation qui ne parle pas de découpe, signalé « à REFUSER » dans `ecarts_metier`. Le code ne relit pas la fiche : que la citation figure bien sur la page se vérifie dans le replay.
- **Publiée sur H** le 18/11 : `verifier-dimension`, révision 1 (`npm run agent:skill -- ../../agents/skills/verifier_dimension.md`, à blanc, puis `--publier`).
- **Agent maison `chez-soi-acheteur`**, révision 1, créé sur H le 18/11 à partir de `definitions/chez-soi-acheteur.json` (`npm run agent:creer -- ../../agents/definitions/chez-soi-acheteur.json`, à blanc, puis `--publier` ou `--publier --mettre-a-jour`). Même base que `h/web-surfer-flash` révision 2 (`h/browser`, `holo4-35b-a3b`, skills `h/company`, `h/user-collaboration`, `h/answering`, `h/planning`), plus `verifier-dimension:1` et les outils `get_mesures` et `demander_validation`. La création ne lance aucune session.
- **Organisation H de l'équipe** (projet « Default », clé de l'app) : skill et agent recréés le 18/11 au soir. Le 19/11 (relecture de Briac), `verifier-dimension:2` compare à `largeur_cm` × `longueur_cm` et précise que `hauteur_cm` (épaisseur d'un tapis) n'est pas une cote au sol ; `chez-soi-acheteur:2` la porte. Instructions sur H identiques à `definitions/chez-soi-acheteur.instructions.md` (révisions 1 et 2, vérifié par GET). Les runs du 18/11 ci-dessous viennent de l'organisation H personnelle d'Aurélie, où les numéros de révision étaient différents.
- Run avec la skill : `npm run agent:u2 -- --site <domaine> --agent chez-soi-acheteur:2`. Pas de surcharge `agent.skills` : `h/web-surfer-flash` porte quatre skills H, et une surcharge les aurait remplacées.
- **Citation vérifiée sur la page** (`dev/fiche.ts`, après chaque run et dans `recontroler.ts`) : GET de la fiche publique, recherche mot à mot de `citation_decoupe` (tolérance d'un mot sur dix). `exacte` ne donne aucun écart. Règle stricte (Bastian, PR #32) : `approchee` (avec les mots changés), `non_verifiable` (fiche illisible) et `absente` donnent tous « produit à REFUSER ».
- **Premier run réel avec la skill** (18/11, `chez-soi-acheteur:2` de l'organisation personnelle, IKEA France, `2026-11-18_u2_462b0477-….json`) : 47 s, 9 étapes, 0,022 USD, arrêt au panier, validation refusée, aucune page interdite. STOPP 67,5 × 200 cm retenu **avec** une citation de découpe. La citation est juste à un mot près : l'agent écrit « tissus » là où la fiche dit « tapis », comme pour le nom du produit aux deux runs précédents. Le modèle lit ce mot de travers ; d'où le contrôle sur la page plutôt qu'une consigne de plus.
- **Comparaison avec et sans la skill** (18/11, même prompt, même schéma, IKEA France ; seul l'agent change) :

  | Agent | Durée | Étapes | Coût | Produit | `citation_decoupe` | Verdict du code |
  |---|---|---|---|---|---|---|
  | `chez-soi-acheteur:2` (skill + instructions) | 47 s | 9 | 0,022 USD | STOPP 67,5 × 200 cm | donnée (« tissus » au lieu de « tapis ») | retrouvée à 1 mot près |
  | `h/web-surfer-flash` (sans) | 70 s | 12 | 0,031 USD | STOPP 67,5 × 200 cm | **absente**, alors que le prompt la demande | **à REFUSER** |

  Avec la skill, l'agent prouve la découpe ; sans elle, il l'affirme seulement dans `remarque`. Un run de chaque côté : à confirmer sur d'autres runs.
- Ancienne note : mesurer avec et sans la skill (`h/web-surfer-flash` contre `chez-soi-acheteur:1`), et noter les runs dans l'onglet Mesures agent.

## Usage 3 : préparer sans envoyer (issue #14)

L'inscription à l'OTV passe par FranceConnect dès l'entrée, et l'espace client de l'assureur exige une connexion. **L'agent n'a aucun identifiant** : il rend la page officielle de la démarche OTV, ce qu'elle demande, la page de l'assureur pour le prévenir, et un récapitulatif (dates, durée, seuil, protections, clause et page). Marc se connecte, relit et envoie lui-même.

**Premier run réel** (18/11, `chez-soi-demarches:1`, MAIF, `bench/runs/2026-11-18_u3_8fc0ec9f-….json`) : 77 s, 16 étapes, 0,041 USD. Pages vues : service-public.gouv.fr (fiche F34634), puis maif.fr jusqu'à la page « nous téléphoner, suivi de contrat ». Aucune page FranceConnect ni espace sociétaire, coupe-circuit non déclenché. L'agent s'est arrêté sur `demander_validation` (`envoi`), refusé, sans rien envoyer. Le récapitulatif est complet : dates, 35 jours, seuil de 30 dépassé, trois protections avec la page de la clause, lien OTV, FranceConnect, délai, téléphone de la MAIF. Ajustements tirés du run : la limite OTV « 3 jours avant (police) » qu'il a lue, absente du code, et le numéro de l'assureur, qui n'est plus signalé.

- `apps/web/lib/absence.ts` (`evaluerAbsence`) et `POST /api/absence` : durée de l'absence, dépassement du seuil d'inoccupation (`null` sans contrat), fenêtre OTV d'après service-public.gouv.fr (fiche F34634, lue le 18/11, à dater dans le Registre des sources) : au plus tôt 45 jours avant le départ ; au plus tard 3 jours avant (police) ou la veille (gendarmerie). `delai_ok` retient la limite la plus stricte. Tant que le client Supabase n'existe pas, la route reçoit `inoccupation` dans le corps.
- Coupe-circuit de l'usage 3 : en plus des motifs par défaut, `franceconnect`, `authorize`, `oauth`, `adherent`, `societaire` ; `inscription` est retiré (les pages publiques de l'OTV le portent).
- `controle_u3.ts` : liens sur service-public ou interieur.gouv.fr et sur le site de l'assureur, `validation_demandee`, dates, durée et seuil présents dans le récapitulatif, aucune adresse e-mail, numéro de téléphone signalé.
- Environnement : navigateur cloud (point ouvert 2 du `CLAUDE.md`, à trancher par Briac). Le run local ne dépend pas de ce choix, puisque l'agent ne se connecte pas.

## Ce que l'usage 1 réutilisera (issue #7)

Tels quels : `apps/web/lib/hai.ts`, `dev/boucle.ts` (quota, création, suivi, cache des outils, coupe-circuit, délais, annulation, enregistrement dans `bench/runs/`) et `evaluerSortie` de `dev/controle.ts`.

À ajouter par `dev/run_u1.ts` : `get_contrat.json` au format de la doc H, une fixture de contrat fictif, un prompt provisoire, le schéma de sortie `{ trouve, url_cg, … }` dans `schemas.ts`, puis le téléchargement du PDF et le contrôle de la référence par le code. Pas d'outil de validation : l'usage 1 est en lecture seule.
