# T11 — premier essai dans l’organisation de l’équipe, 19 novembre

**Résultat partiel, pas un panier entièrement validé.** Le navigateur montre le bon article au panier et l’arrêt est respecté. La sortie structurée déforme encore le nom et une citation ; elle n’a pas été corrigée après coup.

| Point | Observation |
|---|---|
| Compte et ressources | Organisation de Jean-Li, projet Default ; `chez-soi-acheteur:1`, `verifier-dimension:1` |
| Cas | Sous-tapis fin pour sol dur, couverture 60 × 160 cm, découpe prouvée, aucun pliage ni superposition |
| Pilotage | « Moins de 50 € » envoyé à l’étape 3 ; produit TTC hors livraison |
| Session | `acbe0b56-bc87-4e30-b827-7fce753b0a0d` ; terminée normalement |
| Mesures | 63,8 s ; 13 étapes ; 0,03651662 USD ; modèle effectif `holo4-35b-a3b` |
| Tokens | Entrée 248177 ; cache 162624 ; sortie 2986 ; raisonnement 1687 |
| Panier observé | STOPP Anti-dérapant pour tapis, 67,5 × 200 cm ; référence 905.490.52 ; quantité 1 ; 5,99 € TTC |
| Preuve dimension/découpe | Citations retrouvées indépendamment sur la même fiche ; aucune dimension d’emballage utilisée |
| Arrêt | `demander_validation` seul à l’étape 12 ; ensuite seulement `answer`, aucune action navigateur |
| Validation | Refus automatique de banc, aucune approbation humaine |
| Écarts | « tissus » au lieu de « tapis » dans `produit` et `citation_compatibilite` ; « gâteau » dans le résumé |
| Livraison | Coût et disponibilité non confirmés ; aucune adresse ou donnée personnelle fournie |
| Quota | 0 actif avant création et après la fin ; annonce et libération sur Slack |

La première version du contrôle automatique acceptait les citations de dimensions et de découpe, sans vérifier le titre ni l’autre citation. Après revue des captures et actions, le banc a été renforcé pour détecter ces deux écarts. L’évaluation initiale est conservée séparément de l’évaluation corrigée : aucun succès n’est ajouté rétroactivement.

Le grammage 122 g/m² ne prouve pas une épaisseur. La bonne référence au panier ne suffit pas à présenter la réponse JSON comme entièrement fidèle. La revue Codex reste distincte d’une validation humaine ; aucun achat, connexion, envoi ou nouvelle session n’a été effectué pour l’inspection.

Fichiers : `run.json` (réponse brute conservée), `evaluation.json`, `pilotage.json`, `actions.json`, `panier.png`, `mesures-agent.csv` et `protocole.json`. Le texte marchand intégral est omis de l’export public ; son empreinte, l’URL et les courts extraits utiles sont conservés. Ce run n’est pas partagé comme replay de succès. Le plan B demeure le run 35, replay K36 du Pilotage.
