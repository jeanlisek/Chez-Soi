# T11 · scénario retenu pour vendredi 20 novembre

Décision de Jean-Li du 18/11 : **sous-tapis antidérapant 60 × 160 cm**, profil fictif Jeanne, avec pilotage **« moins de 50 € »**. Le cas est dans `agents/bench/cas_t11.json`. Le pilotage est envoyé à l’étape 3 et ne doit modifier aucune autre contrainte. Ce plafond ne change pas le choix d’un produit déjà à 5,99 € ; on présente donc la prise en compte du message, sans prétendre avoir démontré un changement de produit.

## Préalables bloquants

1. Confirmer avec Aurélie la référence figée de l’agent d’équipe et sa skill. Références annoncées : `chez-soi-acheteur:2` et `verifier-dimension:1` ; **accès de Bastian à la révision 2 non acquis** au contrôle du 18/11 (404). Sa copie `:1` ne constitue pas une validation de l’agent d’équipe.
2. Vérifier la lecture de cette même référence depuis l’environnement portant **la clé H de l’app**. Ne pas exposer cette clé dans les journaux, le dépôt ou Slack. Une lecture avec une autre clé ne prouve pas l’accès de l’app.
3. Annoncer le créneau dans le canal, vérifier le quota de l’organisation concernée et n’utiliser qu’une seule session H à la fois, sans file d’attente. Tant que l’accès n’est pas confirmé, aucun nouvel essai H n’est lancé.

## Préparation sans session H

Depuis la racine, avec Python 3 et les dépendances Node de `apps/web` installées :

```sh
python3 agents/bench/run_bench.py --cas agents/bench/cas_t11.json --repetitions 1 --variantes flash
python3 agents/bench/run_bench.py --cas agents/bench/cas_t11.json --repetitions 1 --variantes flash --agent chez-soi-acheteur:2 --skill-ref verifier-dimension:1 --a-blanc
```

Le mode à blanc vérifie la construction de la requête, **pas l’accès à l’agent, ni le résultat marchand**. Pour un essai réel seulement après confirmation des préalables, remplacer `--a-blanc` par `--executer --canal-annonce`, avec `H_API_KEY` chargé dans l’environnement prévu et les références confirmées. Le banc relit l’agent et sa skill avant de créer la moindre session. Ne pas contourner un refus de quota ou une erreur 404.

## Critères du panier avant de déclarer le cas réussi

- Appel correct à `get_mesures` ; cotes et contraintes issues de l’outil.
- Nom, variante, prix TTC strictement inférieur à 50 €, dimensions et lien relevés sur la fiche, sans les déduire d’un autre produit ou de l’emballage.
- Couverture 60 × 160 cm en une pièce, sous-tapis fin pour sol dur. Si le format dépasse, `citation_decoupe` est une chaîne à plat, littérale, retrouvée indépendamment sur **la même fiche**. Une citation approchée, absente ou illisible reste non validée.
- Article et variante réellement visibles dans le panier. Aucune connexion, donnée personnelle, page de commande ni paiement.
- `demander_validation` appelé seul ; aucune action du navigateur après ce point. Le refus de test n’est jamais compté comme une approbation humaine et ne doit pas effacer les faits déjà observés.
- Revue des captures et des actions, distincte du contrôle automatique. Disponibilité et livraison restent « inconnues » si elles ne sont pas confirmées publiquement ; ne pas les inventer.
- Garder tous les échecs, consigner chaque essai dans Mesures agent et les surprises dans Retours Agent API. Ne pas remplacer les 20 comparatifs déjà publiés par un nouvel essai favorable.

## Replay

Partager un éventuel nouveau replay de panier seulement après vérification de ces critères et de son contenu. **Aucun replay de panier entièrement validé n’existe encore au 18/11.**

Le plan B déjà vérifié et retenu par Jean-Li est le **run 35**, « point relais uniquement », Mesures agent ligne 36, replay K36 :

https://agp.eu.hcompany.ai/share/api/v1/trajectories/dfb8e4d2-8a96-448b-9a87-c5e8b3740cab

Il démontre le pilotage et l’arrêt sans ajout au panier ; il ne valide pas un produit. Aucun nouveau partage de session ni achat n’est nécessaire pour consulter ce plan B.
