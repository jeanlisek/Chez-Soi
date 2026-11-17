# supabase/

Le schéma SQL n'est pas encore écrit : il attend la réconciliation entre l'architecture v3 et le doc « CDO · Données et base » (point ouvert 4 du `CLAUDE.md`).

Migrations prévues par la v3, dans `migrations/` :

1. `0001_schema`
2. `0002_rls`
3. `0003_regles`
4. `0004_contrats`
5. `0005_graphe`

Les fichiers `.sql` ne sont pas créés à vide, pour qu'aucune migration vide ne soit enregistrée comme appliquée.
