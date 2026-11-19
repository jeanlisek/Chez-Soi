# T11 — second essai équipe, Pro, 19 novembre

**Échec du cas panier, conservé dans les mesures.** Aucun replay de succès n’est publié. Le run Flash 38 reste le meilleur essai T11 (partiel) ; le replay de secours du run 35 reste inchangé.

| Point | Observation |
|---|---|
| Session | `63e5056a-4eb6-40d4-b6a1-58e93ae21da7` |
| Agent et modèle | `chez-soi-acheteur:1` + `verifier-dimension:1`, Default équipe ; modèle effectif `holo4-27b` |
| Scénario | Même `cas_t11.json` que Flash : sous-tapis 60 × 160 cm, pilotage strictement moins de 50 € |
| Mesures | 165,2 s ; 16 étapes ; 0,11829160 USD |
| Tokens | Entrée 435784 ; cache 363200 ; sortie 24910 ; raisonnement 22772 |
| Pilotage | Budget envoyé à l’étape 3 ; une correction supplémentaire du nom de l’outil est conservée dans `intervention.json` |
| Outil de mesure | 9 appels incorrects : `get_esures` / `get_epures` ; aucun appel correct à `get_mesures` |
| Protection locale | `lire_fiche_produit` refusé : les mesures n’ont pas été reçues |
| Arrêt | `demander_validation` seul, puis `answer` ; aucun ajout au panier et aucune action navigateur après validation |
| Fin | Annulation de supervision demandée (DELETE 204) ; API finale `interrupted`, quota confirmé à 0 actif |

L’agent affirme avoir utilisé l’orthographe correcte et reçu une erreur système. Les traces montrent cependant des noms incorrects. Cette affirmation ne démontre ni un défaut du transport API ni que l’outil déclaré est absent. Le même outil fonctionne avec Flash dans le run 38. Conserver ce cas comme reproduction à montrer aux mentors H ; ne pas créer d’alias qui masquerait l’erreur dans les mesures.

Le pilotage correctif rend ce run distinct d’un essai autonome. L’annulation a coïncidé avec l’arrêt demandé par l’agent : une réponse finale est présente malgré le statut `interrupted`. Le champ brut `motif_fin: terminee` signifie seulement que la boucle a observé un statut terminal ; le banc refuse bien cette session comme succès.

Revue Codex documentée des actions et de la dernière capture : fiche STOPP affichée, aucun ajout, aucune connexion ou donnée personnelle. Refus automatique de banc, aucune approbation humaine. Les réponses et mesures brutes sont conservées ; aucun montant, statut ou succès n’est réparé après coup.
