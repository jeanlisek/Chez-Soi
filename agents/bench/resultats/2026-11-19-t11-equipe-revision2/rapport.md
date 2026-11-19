# T11 — run 40, agent d’équipe révision 2

**Résultat partiel : ajout confirmé, sortie métier refusée.** Aucun replay de succès partagé.

| Champ | Mesure |
|---|---|
| Session | `e806f94c-25b0-4c64-a0c3-9310f8ff52da` |
| Date | 19 novembre 2026, 14 h 41 à Paris |
| Agent / skill | `chez-soi-acheteur:2` / `verifier-dimension:2` |
| Compte | Organisation de Jean-Li, projet Default |
| Modèle | Flash, `holo4-35b-a3b` |
| Parcours | Banc local, lecteur de fiche et schéma expérimental ; pas les écrans de l’app |
| Code testé | `86ab6a365ca04e76265cd4609e4c4d72e89ec5f7` |
| État / outcome H | `completed` / `null` |
| Durée / étapes | 57,7 s / 10 |
| Tokens entrée / cache / sortie / raisonnement | 183436 / 119328 / 3054 / 1879 |
| Coût | 0,02892024 $ |
| Pilotage | « Moins de 50 € », envoyé à l’étape 3 |
| Validation | Refus automatique du banc ; zéro approbation humaine |
| Quota organisation | 0/3 avant, 0/3 après |

## Faits observés

`get_mesures` est appelé correctement, puis la lecture de la fiche STOPP
905.490.52 fournit le nom et les citations sources. L’agent recherche bien un
sous-tapis antidérapant : il ne sélectionne pas le tapis de bain rencontré par
Jean-Li dans son premier essai de l’app.

La capture `ajout-confirme.png` montre la confirmation d’ajout de STOPP,
67,5 × 200 cm, à 5,99 €. **Le panier complet n’est pas ouvert** : aucun total de
panier ni frais de livraison n’est vérifié. Les actions montrent
`demander_validation` seul (index 40), puis `answer` seul (index 45), sans action
navigateur après le refus. Aucune page hors du site IKEA n’est observée.

## Pourquoi le contrôle refuse

- Nom transformé : « tissus » remplace « tapis ».
- `citation_decoupe` est altérée : « Antidimapant facile àcouper ou à plier »
  ne correspond pas à la phrase exacte fournie par la fiche.
- `citation_compatibilite` contient la même altération ; le champ de dimensions
  est fidèle, mais cela ne suffit pas à autoriser le dépassement des cotes.

Le JSON est valide, mais **le contrôle métier est négatif**, comme attendu pour
une citation non retrouvée. On ne corrige pas la réponse brute pour la faire
passer. L’épaisseur et la disponibilité restent non vérifiées, et le délai vaut
« non indiquée avant commande ».

## Portée et suite

Ce run teste la révision 2 **avec les overrides du banc** ; il ne mesure pas le
format de production à deux outils. Il ne permet pas de conclure à un gain du
schéma enrichi sans lecteur ni d’attribuer un défaut au transport de l’API.
Ne pas modifier le contrat de l’app sur cette seule mesure. Flash est conservé
pour la démo, aucun nouvel essai Pro ; le plan B du run 35 reste inchangé.

Mesures agent : ligne 41, run 40. Retours Agent API : ligne 32.
La revue des captures et actions est réalisée par Codex pour Bastian ; elle ne
vaut pas une approbation humaine. Le texte marchand complet reste dans le lot
local ignoré, seuls les extraits et son empreinte sont exportés.
