# Vérification des mesures CP3, 20 novembre 2026

Référence auditée : `a44a2138212bedd95c37ede994d5423e19e39ea7` sur `main`.
Complément à #6 et aux résultats de #125. Les CSV historiques sont conservés sans modification.

## Résultats recalculés

| Population | Réussite | Durée moyenne | Coût moyen USD |
|---|---|---|---|
| Série finale depuis l'app, 10 runs Flash (41–50) | 10/10 selon le contrôle v2 consigné par l'équipe ; 0/10 selon v1 | 74,02 s | 0,02506 |
| Historique, 40 runs (1–40), tous usages et configurations | 11/40 en v1 ; 22/40 en relecture v2 | 88,49 s sur 39 durées connues | 0,06225 |

Le run 24 n'a pas d'heure de fin : il est exclu de la moyenne des durées,
conservé dans les résultats et les coûts. Les coûts des CSV sont arrondis à la
source : leur somme ne remplace pas la facture ni les coûts plus précis des JSON.
Les 50 identifiants de run et préfixes de session sont distincts. Pour les 32 runs
historiques U2, durée et coût ont été rapprochés de la réponse brute, avec une
tolérance correspondant aux arrondis du CSV (0,15 s et 0,00051 USD).

## Temps gagné : estimation vérifiable, pas test humain

Les temps manuels existent dans `docs/resultats_runs.csv` (`main_s`, runs 1–12).
Ce sont trois estimations de l'équipe, répétées sur quatre runs par usage.
Elles ne constituent pas douze chronométrages manuels indépendants.

| Usage | Manuel estimé | Agent mesuré, 4 runs | Gain estimé | Réduction estimée |
|---|---|---|---|---|
| 1, sourcing assureur | 360 s | 126,25 s | 233,75 s | 64,9 % |
| 2, produit au panier | 240 s | 97,225 s | 142,775 s | 59,5 % |
| 3, démarches | 900 s | 77,45 s | 822,55 s | 91,4 % |

Formules : gain = manuel − agent ; réduction = gain / manuel × 100.
Cette comparaison conserve la cohorte 1–12 : elle n'extrapole pas le temps manuel
du tapis 60 × 160 à la série finale 38 × 59. Le run 1 inclut environ 125 s d'attente
de validation. Pour mesurer un gain humain réel, il reste à faire chronométrer
les mêmes tâches à des personnes, avec les mêmes critères et le même périmètre.

## Vérifications exécutées

| Vérification | Résultat | Portée |
|---|---|---|
| `python3 scripts/resultats.py` | OK | Recalcul des 40 runs historiques |
| `python3 scripts/relecture_v2.py` | OK : U2 14/32 en v2, finale 10/10 | Relecture historique et synthèse du CSV de production |
| `python3 scripts/verifier_mesures.py` | OK, JSON associé | Identifiants, arrondis, 32 correspondances brutes, populations et gains estimés |
| `python3 -m unittest discover -s agents/bench -p 'test_bench.py' -v` | 21 tests réussis | Dimensions, refus, citations, outils, pilotage et sécurité des URL ; données simulées |
| `node --import ./apps/web/node_modules/tsx/dist/loader.mjs --test agents/dev/fiche.test.ts agents/dev/u2_schema.test.ts agents/dev/pilotage.test.ts agents/dev/boucle.test.ts` | 19 tests réussis | Contrôle v2, schémas, domaines autorisés et pilotage ; données simulées |
| Lecture publique de la fiche STOPP avec `preuvesSurFiche` du projet | OK, dimensions retrouvées, découpe retrouvée, erreur `null` | Une requête réelle le 20/11 ; aucun panier ni session H |

Fiche vérifiée : https://www.ikea.com/fr/fr/p/stopp-anti-derapant-pour-tapis-90549052/
Nom renvoyé : STOPP anti-dérapant pour tapis, 67.5x200 cm.
Court extrait de la preuve : « Antidérapant facile à couper ou à plier ».
Ces tests ne prouvent ni la disponibilité locale, ni un délai de livraison.

Le résultat détaillé et les empreintes SHA-256 des sources sont dans
[`verification_mesures_2026-11-20.json`](verification_mesures_2026-11-20.json).

## Limites

- Aucun nouveau run H : la série finale existe déjà, inutile de reprendre le créneau partagé.
- Les 10 succès de production sont ceux consignés par l'équipe dans le CSV ; les trajectoires complètes ne sont pas contenues dans ce fichier. Cet audit ne remplace pas une nouvelle observation des 10 parcours.
- Une relecture v2 ne crée pas de nouveaux runs : ne pas compter deux fois les 40 historiques.
- 10/10 sur le même produit et le même site ne prouve pas une réussite de 100 % sur tous les objets de la maison.
- Validation refusée signifie arrêt contrôlé, pas autorisation d'achat. Aucun achat ni envoi réalisé ici.
- Les 40 tests logiciels réussis ne sont pas 40 exécutions d'agent.
