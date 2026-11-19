# supabase/

Projet Supabase `chez-soi`, organisation « Chez Soi », région Paris (eu-west-3).

## Migrations, dans l'ordre

| Fichier | Contenu |
|---|---|
| `migrations/0001_schema.sql` | Extensions (vector, pgcrypto), types, tables métier, index des clés étrangères |
| `migrations/0002_rls.sql` | RLS des tables de 0001, fonctions `prive.*`, buckets privés et policies de stockage |
| `migrations/0003_regles.sql` | `sources`, `regles` (versionnées et figées), `regle_conditions`, `diagnostic_regles`, et leur RLS |
| `migrations/0004_contrats.sql` | `contrats`, `obligations_contrat`, leur RLS, fonction `get_contrat_champs` (serveur uniquement) |
| `migrations/0005_graphe.sql` | `graphe_noeuds` (`embedding vector(1024)`, BAAI/bge-m3), `graphe_aretes`, index HNSW cosinus, RLS, RPC `match_noeuds` et `sous_graphe` |
| `migrations/0006_raccordements.sql` | Vocabulaire `elements` (strict pour `regles`, vue `elements_inconnus` ailleurs), héritage des seuils et conditions d'une version de règle à la suivante, vue `regles_en_vigueur`, `valider_regle`, pièces reliées par nom, cotes des failles, `runs_agent` aligné sur `runAgentSchema`, sorties de l'usage 1 dans `contrats`, correction de la source rang 3 |
| `migrations/0007_origine_mesure.sql` | `failles.origine` (`pipeline` ou `manuel`) : la mesure vient du service vision ou d'une saisie à la main (plan B de la démo) ; distincte de `source` |
| `migrations/0008_agent_analyses_assureurs.sql` | `runs_agent.controle_document` (usage 1, PR #17) ; référentiel `assureurs` (domaines officiels) et `contrats.assureur_id` ; `webhooks_recus` (dédoublonnage par `X-H-Webhook-Delivery`) ; `analyses` (état de la vidéo et du contrat) ; `messages_agent` (pilotage) ; `actions` : `priorite`, `force`, `obligation_id`, `regle_id`, `explication` |
| `migrations/0009_analyses_space.sql` | `analyses` alignée sur le Space vision (PR #18) : statut `termine` (et non `terminee`), `service_analyse_id` (l'`analyse_id` du Space, unique), `origine` (`pipeline` ou `precalcule`, obligatoire pour une vidéo terminée) |
| `migrations/0010_obligations_absence.sql` | `obligations_contrat.liee_absence` et `source` (`cg` ou `cp`) ; `get_contrat_champs` accepte le champ `absence` : obligations liées à l'absence sans durée d'inoccupation (cas MAIF Raqvam, art. 7.2), citation retrouvée seulement, champ absent s'il n'y en a aucune |
| `migrations/0011_purge_videos.sql` | `videos_a_purger(p_limite)` (service_role uniquement) : vidéos du bucket `videos` envoyées il y a plus d'un mois. La route `/api/purge/videos` (cron Vercel quotidien) les supprime par l'API Storage, car supprimer une ligne de `storage.objects` laisse le fichier |

Une migration déjà appliquée ne se modifie jamais : on en ajoute une nouvelle.

## Données

| Fichier | Contenu | Quand |
|---|---|---|
| `seed.sql` | 24 sources P1/P2 du Registre, 12 règles du doc CDO et leurs conditions, nœuds publics du graphe (Element, Regle, ContreMesure) et arêtes `PORTE_SUR`, `CORRIGE` | Après les migrations ; rejouable sans doublon |
| `seed_demo.sql` | Personas fictifs (Marc et Jeanne, Léa, Sophie et Karim) et contrat fictif de Jeanne, rattaché aux CG réelles MAIF Raqvam M2442 (art. 4 p. 18 et art. 7.2 p. 19 ; protections des conditions particulières fictives) | Après création des comptes de démo dans Auth ; remplacer les e-mails en tête du fichier |
| `tests/rls_test.sql` | Preuve qu'un utilisateur A ne voit ni ne modifie rien de B | Après `seed.sql` ; tout est annulé à la fin |
| `tests/graphe_test.sql` | `match_noeuds`, `sous_graphe`, nœuds privés invisibles, héritage des versions, `valider_regle`, pièces, `elements_inconnus`, `get_contrat_champs` (dont le champ `absence` de 0010) | Après `seed.sql` ; tout est annulé à la fin |
| `tests/agent_test.sql` | Tables de 0008 : RLS, écriture serveur uniquement, doublon de webhook ignoré, une action « contrat » cite une clause, une action « loi » ou « recommandé » cite une règle, pas de clause d'un autre contrat | Après `seed.sql` ; tout est annulé à la fin |

## Commandes

CLI Supabase v3, lancée avec `npx` depuis la racine du dépôt (`supabase/config.toml` est versionné). Depuis la v3, les commandes visent une base **locale** par défaut : `--remote` vise le projet relié.

```bash
npx supabase login                                     # une fois par poste
npx supabase link --project-ref hfcunqjqmtlozhiwfihl
npx supabase migration list --remote                   # le dépôt et le projet doivent afficher les mêmes versions
npx supabase db push --remote --dry-run                # puis sans --dry-run pour appliquer
psql "$DATABASE_URL" -f supabase/seed.sql
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql    # attendu : NOTICE « RLS OK »
npx supabase gen types typescript --remote > apps/web/lib/supabase/types.ts
```

- **Windows (PowerShell)** : si l'exécution de scripts est désactivée, écrire `npx.cmd` au lieu de `npx`. Sous Windows PowerShell 5, `>` écrit en UTF-16 : pour les types, utiliser `| Out-File -Encoding utf8 apps/web/lib/supabase/types.ts`.
- **Réseau** : le Wi-Fi de l'école bloque le port 5432 (constaté le 18/11/2026). Les commandes `--remote` et `psql` passent par un partage de connexion. L'application (HTTPS) et n8n ne sont pas concernés.

Les migrations 0001 à 0004 ont été appliquées le 17/11/2026, et 0005 à 0007 le 18/11/2026, depuis l'éditeur SQL du dashboard, à partir de ces fichiers exacts (empreintes SHA-256 contrôlées). L'historique de la CLI a été aligné le 18/11/2026 (déjà fait, ne pas relancer) :

```bash
npx supabase migration repair 0001 0002 0003 0004 0005 0006 0007 --status applied --remote
```

`DATABASE_URL` et le mot de passe de la base sont dans le coffre-fort de l'équipe, jamais dans le dépôt.

## Raccordement avec n8n et l'application

- **Upserts n8n** : `failles`, `obligations_contrat` et `graphe_noeuds` sur `id` ; `graphe_aretes` sur `(source_id, cible_id, relation)` ; `regles` sur `(code, version)`.
- **Pièces** : n8n doit envoyer le nom de pièce dans `failles.piece` ; le trigger crée ou retrouve la pièce (sans tenir compte de la casse) et remplit `piece_id`.
- **Vocabulaire** : la table `elements` est la liste commune pour la vision, l'extraction du contrat et les règles. Une valeur hors liste est acceptée dans `failles`, `obligations_contrat` et `declarations`, et signalée dans la vue `elements_inconnus`.
- **Veille** : une nouvelle version de règle hérite des `parametres` et des `regle_conditions` de la précédente. La valider : `select public.valider_regle('CODE', 2, 'Prénom Nom');` (service_role, depuis l'éditeur SQL).
- **Moteur de verdict** : lire `regles_en_vigueur` (dernière version validée de chaque code).
- **runs_agent** : `etat_final` du client H va dans `statut_final`, `usage` s'écrit 1, 2 ou 3, `sortie_finale` remplace `resultat`.
- **Webhooks H** (`/api/webhooks/hai`) : insérer d'abord dans `webhooks_recus` avec `on conflict (livraison_id) do nothing` ; 0 ligne insérée = livraison déjà traitée, répondre 200 sans rien refaire.
- **Analyses** : une ligne par vidéo de pièce ou par contrat, `statut` de `en_attente` à `termine` ou `echec` (avec `erreur`), valeurs recopiées du Space. `service_analyse_id` garde l'`analyse_id` renvoyé par `POST /analyse` pour interroger `GET /analyse/{id}`. Une vidéo terminée porte son `origine` : `pipeline` (calcul en direct) ou `precalcule` (plan B), que l'interface affiche. L'interface lit cette table pour savoir si la 3D ou l'extraction est prête.
- **Pilotage** : chaque consigne envoyée à une session (`/api/agent/steer`) est une ligne de `messages_agent`.
- **Plan d'action** (`/api/plan`) : `actions.force` suit `regles.force` ; une action `contrat` exige `obligation_id` (clause et page), une action `loi` ou `recommande` exige `regle_id`. `explication` est le texte du LLM, qui ne change jamais le verdict.
- **Assureurs** : `assureurs.domaines` sert au contrôle du domaine officiel du PDF (usage 1). Le référentiel est vide : à remplir après le choix de l'assureur de démo.

## Conservation des vidéos

Une vidéo est supprimée un mois après son envoi (décision du 19/11/2026). Chaque jour à 3 h UTC, le cron Vercel appelle `GET /api/purge/videos`, qui lit `videos_a_purger` puis supprime les fichiers par l'API Storage. Le modèle 3D, l'image annotée, les points et leurs cotes restent. L'écran Capture l'annonce à l'utilisateur. Prérequis : migration 0011 appliquée et `CRON_SECRET` défini dans Vercel (production).

Vérifier à la main : `select * from public.videos_a_purger(100);` dans l'éditeur SQL (aucune ligne avant le 16/12/2026 pour les vidéos du hackathon).

## Purge après la démo

Pour le reste des données, date à confirmer en équipe (proposition : 21/11/2026, valeur de `conservation_jusqu_au` dans `seed_demo.sql`).

1. Storage : vider les buckets `videos`, `contrats`, `modeles3d` et `exports` (dashboard, Storage, ou API Storage). Une suppression SQL dans `storage.objects` ne supprime pas les fichiers eux-mêmes.
2. Base :

```sql
delete from public.logements where conservation_jusqu_au <= current_date;  -- cascade : pièces, occupants, failles, actions, contrats…
delete from public.runs_agent where action_id is null and created_at < now() - interval '7 days';
delete from public.webhooks_recus where recu_le < now() - interval '7 days';
```
