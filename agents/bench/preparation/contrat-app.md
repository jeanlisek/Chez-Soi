# U2 — contrat de l’app et expérimentation locale

La relecture de Jean-Li a identifié un couplage : modifier `sortieUsage2Schema`
changeait aussi `agent.answer_format` dans l’app, même sans toucher sa route.
Cette modification n’avait pas été testée depuis l’app. Elle est retirée de la #32.

| Parcours | Format | Outils |
|---|---|---|
| App de production | `apps/web/lib/schemas.ts`, identique à main | `get_mesures`, `demander_validation` |
| Banc local | `agents/bench/schema_u2.ts`, champs expérimentaux et trois citations | Les deux précédents + `lire_fiche_produit` |

**Le lecteur reste un outil de banc.** Son éventuel raccordement serveur et une
nouvelle révision de l’agent nécessitent une décision et un essai depuis l’app.
La #32 ne modifie ni `lib/agent/usages.ts`, ni `lib/agent/outils.ts`, ni l’agent H publié.

**Aucune amélioration sans lecteur n’est démontrée.** Les essais ont porté sur
le schéma enrichi avec le lecteur. Même dans ce parcours, Flash déforme encore
le nom et une citation ; Pro échoue sur le nom de l’outil de mesure. On ne peut
pas attribuer le résultat au seul schéma ni conclure sur l’app à deux outils.
Les citations supplémentaires sont optionnelles au niveau du schéma, mais leur
exactitude est demandée par le protocole du banc : cela ajoute une exigence de
fidélité, sans garantie que le modèle la respecte mieux par lecture visuelle.

Avant de promouvoir ce format : comparer en Flash les deux formats sur les mêmes
cas, dans le parcours app à deux outils, garder les échecs et vérifier les preuves
et l’arrêt. Cette comparaison n’a pas été exécutée. Aucun nouvel essai Pro prévu
avant la démo, conformément à la décision de Jean-Li.
