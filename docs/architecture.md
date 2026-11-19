# Architecture

Référence : Architecture technique v3 (Briac, 17/11), résumée dans [`CLAUDE.md`](../CLAUDE.md). Cette page décrit les circuits tels qu'ils tournent en production au 18/11.

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

Circuit sans attente côté Vercel : une route crée la session, les webhooks signés déclenchent les réponses aux outils (`get_mesures`, `get_contrat`), et `demander_validation` n'est répondu qu'après le clic de l'utilisateur. Détail et règles dans `CLAUDE.md` et `agents/README.md`. Branchement dans l'application : PR #40.
