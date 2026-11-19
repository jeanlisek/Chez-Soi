# Banc U2 — préparation et mesures

Le prompt définitif concerne tous les objets du logement. Le banc reproductible utilise
le cas fictif du sous-tapis 60 × 160 cm ; les contrôles de couverture ne sont pas des
règles universelles pour les meubles ou les équipements électriques.

## Frontière avec l’application

Le lanceur local utilise `schema_u2.ts` (`sortieUsage2BancSchema`) et trois outils,
dont `lire_fiche_produit`. L’app continue à utiliser `sortieUsage2Schema` de `main`
et les deux outils de `chez-soi-acheteur:1` : `get_mesures`, `demander_validation`.
La #32 ne modifie plus le format de réponse de l’app et ne lui ajoute aucun handler.

Les runs 38/39 ne sont pas des essais depuis l’app. Les trois citations du banc ne
prouvent aucune amélioration sans le lecteur ; même avec lui, Flash a déformé le
nom et `citation_compatibilite`. Le format de production conserve sa seule
`citation_decoupe` optionnelle. Avant toute promotion du schéma expérimental :
comparaison en Flash, mêmes cas et arrêt, depuis l’app avec ses deux outils, puis
décision explicite sur le handler et la révision H. Aucun nouvel essai H n’est
nécessaire pour vérifier cette séparation de code.

## Agent et skill

Référence équipe confirmée par Aurélie et accessible le 19/11 :
`chez-soi-acheteur:1`, skill `verifier-dimension:1`, projet **Default** de
l’organisation de Jean-Li. La nouvelle clé personnelle de Bastian reste dans son
`.env` local ignoré, permissions `600`, et expire le 21/11. Le stockage est limité
à son compte sur son Mac ; la clé elle-même n’est pas liée à un appareil par H.
Les 25 runs du 18/11 ont utilisé une copie dans son organisation personnelle,
également nommée `chez-soi-acheteur:1` : ce sont des ressources distinctes.
Les nouveaux essais équipe ne sont donc pas ajoutés au comparatif historique.
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
Les nouvelles requêtes utilisent `largeur_cm` × `longueur_cm` au sol ;
`hauteur_cm` est une épaisseur optionnelle. Seules les contraintes de l’objet
sont transmises à H, sans âge ni données de santé des occupants.
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

Le premier essai réel sur l’agent de l’équipe (19/11) est dans
`resultats/2026-11-19-t11-equipe/` : panier réel à 5,99 €, pilotage et arrêt vérifiés,
mais nom et citation de compatibilité déformés. Le résultat reste partiel.
Le banc contrôle désormais aussi ces champs contre la fiche lue, sans réécrire
la sortie brute. Le replay de secours du run 35 reste inchangé.

Le second essai T11 en Pro, dans `resultats/2026-11-19-t11-equipe-pro/`, échoue
avant tout panier : neuf noms d’outil de mesure incorrects, malgré une correction
pendant le run. La lecture de fiche est bloquée côté handler, puis l’agent demande
validation sans ajout. Statut final `interrupted` après annulation de supervision,
165,2 s et 0,11829160 USD. Cet échec reste dans les mesures ; aucun nouveau replay
de succès n’est publié. Flash reste le modèle conseillé pour la démo à ce stade.
