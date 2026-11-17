# n8n/

Les JSON de ce dossier sont la référence des workflows. Quand on modifie un workflow dans l'interface n8n, on fait un pull et on commite. On ne fait jamais de push sans prévenir Bastian.

```bash
npm run n8n:pull
```

```bash
npm run n8n:push
```

`n8n:push` est une simulation tant qu'on n'ajoute pas `-- --confirmer`. Les deux commandes se lancent depuis la racine et lisent `N8N_URL` et `N8N_API_KEY` dans le `.env` de la racine. Le détail est dans la section « Commandes » du `CLAUDE.md`.

Le pull ne porte que sur les workflows qui ont déjà un fichier ici : `pipeline_analyse`, `analyse_contrat`, `veille_reglementaire` et `suivi_runs`. Les autres workflows de l'instance ne sont pas exportés.

`suivi_runs.json` est une place réservée, vide : ce workflow n'existe pas encore, et son rôle dépend du point ouvert 3 du `CLAUDE.md` (webhooks `completed` et `failed`).

Aucun secret en dur dans les nœuds : on passe par un credential n8n ou une variable d'environnement.
