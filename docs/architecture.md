# Architecture

Référence : Architecture technique v3 (Briac, 17/11), résumée dans [`CLAUDE.md`](../CLAUDE.md). Cette page décrit les circuits tels qu'ils tournent en production au 19/11.

## Principe : c'est l'application qui écrit en base

n8n orchestre les appels au Space Hugging Face, mais n'a aucune clé Supabase. Il renvoie les résultats à une route de l'application, qui vérifie puis écrit avec la clé `service_role`, côté serveur.

## Vidéo d'une pièce

1. L'app dépose la vidéo dans le bucket privé `videos` (URL signée) et crée une ligne `analyses`.
2. L'app appelle le webhook n8n `pipeline_analyse` (en-tête secret). n8n répond tout de suite, puis appelle le Space (`POST /analyse`), avec de nouveaux essais pendant son réveil.
3. Analyse terminée : n8n copie le modèle 3D dans le bucket `modeles3d` grâce à une URL de dépôt signée fournie par l'app (`/api/analyse/modele-url`).
4. n8n renvoie le résultat à `/api/analyse/resultat`, qui écrit `failles`, `analyses`, `pieces`, puis recalcule le plan.

## Contrat

1. L'app dépose le PDF dans le bucket privé `contrats` et appelle n8n `analyse_contrat` avec une URL signée de dix minutes.
2. Le Space lit le PDF (`POST /contrat`) et rend les clauses, chacune avec sa citation, sa clause et sa page.
3. n8n filtre (citation non vide et retrouvée dans le PDF) et renvoie les clauses à l'app.
4. `/api/contrat` revalide, écrit `obligations_contrat`, les nœuds Clause et les arêtes IMPOSE du graphe, puis recalcule le plan.

## Plan d'action (`apps/web/lib/plan.ts`)

1. Chaque faille est rattachée à un élément du vocabulaire commun. Hors vocabulaire : recherche par similarité dans le graphe (`match_noeuds`, embeddings bge-m3), retenue seulement si l'écart avec le deuxième nœud est net.
2. Les règles validées de cet élément sont évaluées (conditions de profil : la règle qui protège l'occupant le plus vulnérable s'applique).
3. Force du verdict : contrat (obligation citée), puis loi, puis recommandation.
4. Le sous-graphe à 2 sauts (`sous_graphe`) fournit le contexte ; un LLM rédige l'explication, un garde-fou en code la relit. Sans réponse valable : texte construit à partir de la règle.
5. Écriture de `diagnostic_regles` et de `actions`. Une action déjà lancée n'est jamais effacée.

## Agent H

Circuit sans attente côté Vercel :

1. `POST /api/agent/run` crée la session sur l'agent maison figé (`nom:N`) de l'usage, avec la page de départ et la tâche préparées depuis la base, et écrit `runs_agent`.
2. H appelle `/api/webhooks/hai` (signature vérifiée, doublons ignorés dans `webhooks_recus`). La route répond tout de suite, puis relit `/changes` : coupe-circuit sur les pages vues, réponses à `get_mesures` et `get_contrat`, enregistrement de `demander_validation` dans `validations`.
3. `demander_validation` n'est répondu qu'après le clic de l'utilisateur (`POST /api/agent/tools`). `POST /api/agent/steer` envoie une consigne pendant le run.
4. En fin de session, la réponse est revalidée (Zod et contrôle métier) et `runs_agent` complété. Usage 1 : le code télécharge le PDF des conditions générales sur les domaines officiels de l'assureur et vérifie lui-même la référence.

Branchés dans l'application : les trois usages. Usage 1 depuis l'écran Contrat, usage 2 depuis le plan d'action, usage 3 depuis le mode absence : `POST /api/absence` enregistre les dates dans `absences`, que l'agent `chez-soi-demarches:1` relit ; à l'arrêt, la seule réponse possible refuse l'envoi (PR #86 et #90). Résultats mesurés : [`resultats.md`](resultats.md). Règles et détail : `CLAUDE.md` et `agents/README.md`.
