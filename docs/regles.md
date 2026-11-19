# Règles

Les règles de risque sont dans la base, pas dans le code. Elles sont chargées par [`supabase/seed.sql`](../supabase/seed.sql) (rejouable) et lues par le calcul du plan (`apps/web/lib/plan.ts`).

## Principes

- **Une règle validée exige une source vérifiée et datée.** La table `sources` reprend les rangs 1 à 24 (priorités P1 et P2) du Registre des sources de l'équipe, vérifiés le 17/11/2026. Un trigger (`regles_controler_source`, migrations 0003 et 0006) refuse une règle `validee` sans source P1 ou P2.
- **Force du verdict** : contrat (obligation citée avec sa clause et sa page, table `obligations_contrat`), puis `loi`, puis `recommande`, puis `information`.
- **Profil** : chaque règle porte des conditions sur le profil (`regle_conditions` : déplacement, vue, audition, vigilance, statut d'occupation, absence). Conditions d'un même groupe : ET ; groupes différents : OU. Une règle sans condition vaut pour tous. Quand plusieurs occupants vivent dans le logement, la règle qui protège le plus vulnérable s'applique.
- **Versions** : une règle se modifie par une nouvelle version (`code`, `version`), jamais en place. La veille réglementaire (`n8n/veille_reglementaire.json`, chaque lundi une fois activée) lit Légifrance par l'API PISTE et propose une nouvelle version au statut `proposee` ; elle n'entre dans le graphe qu'après validation humaine.

## Règles en vigueur au 19/11 (13)

| Code | Règle | Force | Statut | Source (rang du registre) |
|---|---|---|---|---|
| ACC-PORTE-ENT | Porte d'entrée : passage utile ≥ 0,83 m | recommandé | validée | Arrêté du 24/12/2015 (11) |
| ACC-PORTE-INT | Porte intérieure : passage utile ≥ 0,77 m | recommandé | validée | Arrêté du 24/12/2015 (11) |
| ACC-RESSAUT | Ressaut ≤ 2 cm, bord arrondi ou chanfreiné | recommandé | validée | Arrêté du 24/12/2015 (11) |
| ESC-MAIN-COUR | Main courante entre 0,80 et 1,00 m | recommandé | validée | Arrêté du 24/12/2015, art. 6.1 (11) |
| ESC-MARCHES | Marches : hauteur ≤ 17 cm, giron ≥ 28 cm | recommandé | validée | Arrêté du 24/12/2015, art. 6.1 (11) |
| ESC-VIGILANCE | Bande d'éveil en haut, contremarches extrêmes contrastées | recommandé | validée | Arrêté du 24/12/2015, art. 6.1 (11) |
| CHUTE-TAPIS | Tapis fixés ou munis de bandes antidérapantes | recommandé | validée | pour-les-personnes-agees.gouv.fr, CNSA (20) |
| CHUTE-NUIT | Éclairage sans zone d'ombre, chemin lumineux la nuit | recommandé | validée | pour-les-personnes-agees.gouv.fr, CNSA (20) |
| CAMB-SERRURE | Serrure multipoints certifiée A2P (donnée déclarée) | recommandé | validée | CNPP, référentiel H61 (16) |
| ABS-OTV | Inscription à l'OTV : de 45 jours à 3 jours avant le départ (police), jusqu'à la veille (gendarmerie) | information | validée | Service-Public (9) |
| LOC-TRAVAUX | Locataire : demande écrite au bailleur avant travaux d'adaptation | information | validée | Loi du 6 juillet 1989, art. 7 f (7) |
| DAAF | Détecteur de fumée dans le logement (version 2) | loi | validée | CCH art. R142-2, Légifrance (LEGIARTI000051721576) |
| CAMB-FENETRES | Verrouiller avec soin la fermeture des portes, fenêtres et volets | recommandé | validée | Service-Public, actualité A15031 (conseil police et gendarmerie) |

Les seuils d'accessibilité de l'arrêté du 24/12/2015 visent les logements neufs ; Chez Soi les emploie comme recommandations pour un logement existant, jamais comme obligations.

## Graphe de connaissances

Le même seed crée les nœuds publics `Element`, `Regle`, `ContreMesure` et `Article` (3 textes de loi : arrêté du 24/12/2015, CCH art. R142-2, loi du 6 juillet 1989 art. 7 f) et leurs arêtes (`PORTE_SUR`, `CORRIGE`, `Article IMPOSE Regle`). La lecture d'un contrat ajoute des nœuds `Clause` et des arêtes `IMPOSE`, rattachés au contrat et lisibles par son seul propriétaire (RLS). Quand la vision nomme un objet hors du vocabulaire commun, le plan cherche l'élément le plus proche par embeddings (`BAAI/bge-m3`, fonction `match_noeuds`) et ne le retient que si l'écart avec le deuxième candidat est net. Détail : [`architecture.md`](architecture.md#plan-daction-appsweblibplants).
