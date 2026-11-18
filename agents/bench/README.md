# Banc U2 — préparation et mesures

Le prompt définitif concerne tous les objets du logement. Le banc reproductible utilise
le cas fictif du sous-tapis 60 × 160 cm ; les contrôles de couverture ne sont pas des
règles universelles pour les meubles ou les équipements électriques.

## Agent et skill

Référence équipe (PR #20) : `chez-soi-acheteur:2`, skill `verifier-dimension:1`.
La clé de Bastian ne voit pas ces ressources. Avec son accord, une copie fidèle des
fichiers de cette PR a été publiée dans son organisation : `chez-soi-acheteur:1`,
`verifier-dimension:1`. Ce sont des ressources différentes malgré les mêmes noms.
Le banc vérifie le raccordement avant toute création et fixe le modèle par surcharge,
sans modifier la définition publiée ni la skill d’Aurélie.

## Exécution

Depuis la racine, avec Node accessible et `apps/web` installé par `npm ci` :

```sh
python3 agents/bench/run_bench.py
python3 agents/bench/run_bench.py --a-blanc --limite 1
python3 agents/bench/run_bench.py --executer --canal-annonce \
  --agent chez-soi-acheteur:1 --skill-ref verifier-dimension:1
```

Les essais réels chargent `H_API_KEY` depuis l’environnement (la conserver dans le
`.env` local ignoré). Une session à la fois pour toute l’organisation, annoncée dans
le canal de l’équipe ; quota relu avant chaque création, `queue:false`, verrou local.
Le drapeau `--canal-annonce` atteste une annonce réelle, il ne l’envoie pas.
Aucun achat, connexion, paiement ni formulaire envoyé. Validation toujours refusée.
Le coupe-circuit observe les actions après coup ; il ne garantit pas l’absence de clic.

5 cas × 2 répétitions × 2 modèles = **10 Flash et 10 Pro** :

| Cas | Objectif |
|---|---|
| IKEA référence | Panier compatible, découpe prouvée par citation |
| Decoweb secours | Prix total de la variante, pas prix au m² |
| Pilotage sans découpe | Message à l’étape 3 : format strictement plus petit que le tapis, sinon refus |
| Pilotage budget 3 € | Message à l’étape 3 : budget strictement inférieur au prix du STOPP |
| Budget impossible | Refus justifié, aucun produit inventé |

Troisième consigne à essayer séparément : « Livraison en point relais uniquement ;
ne pas ouvrir la commande ni fournir d’adresse. Si ce mode n’est pas prouvé avant
le tunnel de commande, explique le blocage et ne présente pas la livraison comme acquise. »
Le cas sans découpe admet un format plus petit uniquement sur demande explicite.
Un refus conforme n’établit pas à lui seul l’exhaustivité des recherches : revue du replay.

## Preuves et exports

Chaque lot garde le plan, l’empreinte du prompt, les runs bruts, le pilotage horodaté,
les évaluations et `mesures-agent.csv` (outcome, durée, étapes, tokens, coût). Une mesure
absente reste vide, jamais zéro. Les échecs restent dans le dénominateur.
`preuves.py` relit les fiches HTTPS sur une liste fermée, avec redirections contrôlées,
exclut scripts et contenu masqué, vérifie les cotes et exige une citation littérale
pour toute découpe. Une fiche inaccessible reste non vérifiable.
Le helper de la PR #20 garde son diagnostic de citation approchée ; celle-ci n’est pas
une preuve de conformité du banc. Aucun outcome ou texte de l’agent ne vaut une preuve.

La revue (`revue_humaine`, `succes_valide`) reste à faire tant que le panier, le nom,
la variante et l’arrêt ne sont pas réellement inspectés. Après revue :

```sh
python3 agents/bench/run_bench.py --exporter CHEMIN_DU_LOT
python3 agents/bench/partager_replay.py CHEMIN_EVALUATION --partager
```

Le partage n’est pas automatique : il rend public le replay d’une persona fictive
après vérification qu’il ne contient pas d’information privée.
Le banc s’arrête sur erreur technique, coupe-circuit ou session non terminale ; aucune
relance automatique d’une session terminée (un message la relancerait et la facturerait).
Reporter les résultats dans les onglets Mesures agent et Retours Agent API du Pilotage.

Une inspection réalisée par Codex est inscrite séparément (`revue_documentee`,
`auteur_revue`, `preuves_revue`, `succes_verifie`). Elle ne remplit jamais à la place
d’un humain les champs `revue_humaine` et `succes_valide`. Un replay peut être partagé
après cette revue documentée d’une session fictive ; son type de revue est indiqué.

## Résultats du 18 novembre

Les **20 runs de comparaison** sont dans `resultats/2026-11-18-bastian/` :
10 Flash, 10 Pro, même prompt archivé et même révision d’agent. Les échecs restent
dans les mesures. Le run 12 a été interrompu : le lanceur avait encore un statut
`running`, puis l’API a confirmé `interrupted` et un quota à zéro avant la reprise.
Sa durée publiée est une borne inférieure observée, pas une fin API inventée.

Les validations suivantes utilisent un prompt amélioré et sont **hors des 20**.
Le custom tool local `lire_fiche_produit` donne le texte public, le titre et de courts
extraits littéraux après `get_mesures`, pour éviter une recopie uniquement visuelle.
Il est raccordé par les overrides de session, sans modifier la skill d’Aurélie.
Le client doit disposer de Python 3 (bibliothèque standard) et du même accès réseau
aux deux marchands. Pour le porter dans l’application ou n8n, raccorder aussi ce
handler de lecture ; aucun handler de production n’est ajouté à une route ici.

La relecture inclut seulement les panneaux IKEA `product-details` et `measurements`
observés sur les fiches (onglets dépliables), exclut l’emballage, les scripts et les
contenus cachés arbitraires. Une citation incorrecte reste refusée après cette lecture.
Les réponses brutes ne sont jamais corrigées pour gonfler le taux de réussite.

## Scénario T11 retenu

La décision de Jean-Li du 18/11 est préparée dans `cas_t11.json` : sous-tapis 60 × 160 cm et pilotage « moins de 50 € ». Voir `preparation/t11-vendredi.md` pour l’accès à l’agent d’équipe et à la clé de l’app, les critères de réussite et le replay de secours. Ce cas est séparé des 20 comparatifs déjà mesurés ; sa préparation à blanc ne constitue pas un run réel réussi.
