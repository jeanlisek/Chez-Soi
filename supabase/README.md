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

Une migration déjà appliquée ne se modifie jamais : on en ajoute une nouvelle.

## Données

| Fichier | Contenu | Quand |
|---|---|---|
| `seed.sql` | 24 sources P1/P2 du Registre, 12 règles du doc CDO et leurs conditions, nœuds publics du graphe (Element, Regle, ContreMesure) et arêtes `PORTE_SUR`, `CORRIGE` | Après les migrations ; rejouable sans doublon |
| `seed_demo.sql` | Personas fictifs (Marc et Jeanne, Léa, Sophie et Karim) et contrat fictif de Jeanne | Après création des comptes de démo dans Auth ; remplacer les e-mails en tête du fichier |
| `tests/rls_test.sql` | Preuve qu'un utilisateur A ne voit ni ne modifie rien de B | Après `seed.sql` ; tout est annulé à la fin |
| `tests/graphe_test.sql` | `match_noeuds`, `sous_graphe`, nœuds privés invisibles, héritage des versions, `valider_regle`, pièces, `elements_inconnus`, `get_contrat_champs` | Après `seed.sql` ; tout est annulé à la fin |

## Commandes

```bash
supabase link --project-ref hfcunqjqmtlozhiwfihl
supabase db push            # applique les migrations manquantes
psql "$DATABASE_URL" -f supabase/seed.sql
psql "$DATABASE_URL" -f supabase/tests/rls_test.sql   # attendu : NOTICE « RLS OK »
supabase gen types typescript --project-id hfcunqjqmtlozhiwfihl > apps/web/lib/supabase/types.ts
```

Les migrations 0001 à 0004 ont été appliquées le 17/11/2026, et 0005 et 0006 le 18/11/2026, depuis l'éditeur SQL du dashboard, à partir de ces fichiers exacts (empreintes SHA-256 contrôlées). Pour que la CLI le sache, une seule fois après `supabase link` :

```bash
supabase migration repair --status applied 0001 0002 0003 0004 0005 0006
```

`DATABASE_URL` et le mot de passe de la base sont dans le coffre-fort de l'équipe, jamais dans le dépôt.

## Raccordement avec n8n et l'application

- **Upserts n8n** : `failles`, `obligations_contrat` et `graphe_noeuds` sur `id` ; `graphe_aretes` sur `(source_id, cible_id, relation)` ; `regles` sur `(code, version)`.
- **Pièces** : n8n doit envoyer le nom de pièce dans `failles.piece` ; le trigger crée ou retrouve la pièce (sans tenir compte de la casse) et remplit `piece_id`.
- **Vocabulaire** : la table `elements` est la liste commune pour la vision, l'extraction du contrat et les règles. Une valeur hors liste est acceptée dans `failles`, `obligations_contrat` et `declarations`, et signalée dans la vue `elements_inconnus`.
- **Veille** : une nouvelle version de règle hérite des `parametres` et des `regle_conditions` de la précédente. La valider : `select public.valider_regle('CODE', 2, 'Prénom Nom');` (service_role, depuis l'éditeur SQL).
- **Moteur de verdict** : lire `regles_en_vigueur` (dernière version validée de chaque code).
- **runs_agent** : `etat_final` du client H va dans `statut_final`, `usage` s'écrit 1, 2 ou 3, `sortie_finale` remplace `resultat`.

## Purge après la démo

Date à confirmer en équipe (proposition : 21/11/2026, valeur de `conservation_jusqu_au` dans `seed_demo.sql`).

1. Storage : vider les buckets `videos`, `contrats`, `modeles3d` et `exports` (dashboard, Storage, ou API Storage). Une suppression SQL dans `storage.objects` ne supprime pas les fichiers eux-mêmes.
2. Base :

```sql
delete from public.logements where conservation_jusqu_au <= current_date;  -- cascade : pièces, occupants, failles, actions, contrats…
delete from public.runs_agent where action_id is null and created_at < now() - interval '7 days';
```
