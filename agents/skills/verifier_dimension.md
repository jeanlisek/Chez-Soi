<!--
Skill maison de l'agent H (issue #15). Publiée par `npm run agent:skill -- agents/skills/verifier_dimension.md --publier`.
Format (doc H, https://hub.hcompany.ai/agents-api/skills/create.md) : `name` (kebab-case, immuable),
`description` (déclencheur, seule chose que l'agent lit avant de charger la skill), `body` (Markdown).
Le script lit `name` et `description` dans le bloc ci-dessous et envoie le reste comme `body`.
Ce commentaire n'est pas envoyé.
-->
---
name: verifier-dimension
description: À utiliser quand tu dois choisir un produit qui doit tenir dans une cote donnée (tapis, sous-tapis, barre, rampe, main courante…) et décider s'il convient, avant de le mettre au panier.
---

# Vérifier qu'un produit respecte la cote

Tu as reçu des cotes en centimètres par l'outil `get_mesures`. Les deux côtés au sol de la cote sont `largeur_cm` et `longueur_cm` (pour un tapis : sa largeur et sa longueur). Si `longueur_cm` est absent, prends `cote_confirmee_cm` comme deuxième côté et dis-le dans `remarque`. `hauteur_cm`, quand il est donné, n'est **pas** une cote au sol : pour un tapis, c'est son épaisseur. Ne compare jamais la longueur ou la largeur d'un produit à `hauteur_cm`. Avant de retenir un produit, applique ces règles **dans l'ordre**. Elles priment sur ton intuition.

## 1. Lire les dimensions sur la fiche

- Ouvre la fiche du produit. Lis ses dimensions dans la fiche elle-même : titre de la variante, tableau des caractéristiques, onglet « Dimensions », « Caractéristiques » ou « Description produit ».
- Choisis la variante de taille avant de lire : les dimensions changent souvent d'une variante à l'autre.
- Si la fiche n'affiche **aucune** dimension chiffrée pour la variante, le produit est **refusé**. Ne déduis jamais une dimension d'une photo, d'un avis client ou d'un autre produit.

## 2. Comparer à la cote

- Compare le plus petit côté du produit au plus petit côté de la cote (`largeur_cm` ou `longueur_cm`), et le plus grand côté au plus grand.
- Si les deux côtés du produit sont inférieurs ou égaux à ceux de la cote : le produit **convient**. Passe à l'étape 4.
- Si au moins un côté dépasse : passe à l'étape 3.

## 3. Produit plus grand : une preuve est obligatoire

Un produit plus grand que la cote n'est acceptable que s'il **se découpe** (aux ciseaux, au cutter, « à recouper », « découpable », « peut être coupé à la taille souhaitée »…).

- Cherche cette information **sur la fiche du produit**. Ouvre l'onglet ou la section qui la contient.
- Si tu la trouves : recopie la phrase **mot pour mot**, telle qu'affichée, sans la reformuler ni la traduire, dans le champ `citation_decoupe` de ta réponse. Une phrase complète, pas un mot isolé.
- Si tu ne la trouves pas sur la fiche, le produit est **refusé**, même si tu penses qu'il se découpe. Cherche un autre produit.
- Un produit qui se découpe mais dont la plus petite taille reste trop petite d'un côté ne convient pas non plus.

## 4. Dans ta réponse finale

- `largeur_cm` et `longueur_cm` : les dimensions lues sur la fiche, pour la variante choisie, en centimètres.
- `citation_decoupe` : uniquement si le produit dépasse la cote ; la phrase exacte de la fiche. Laisse ce champ vide sinon.
- `remarque` : dis où tu as lu les dimensions et, le cas échéant, la citation (nom de l'onglet ou de la section).

Ne mets jamais une dimension ou une citation que tu n'as pas lue sur la fiche : le code compare ta réponse à la cote et refuse un produit plus grand sans citation.
