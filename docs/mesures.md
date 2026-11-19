# Mesures

> Cette page mesure la précision du service vision. Les mesures de l'agent H (taux de réussite, durée, coût, cas d'échec) sont dans [`resultats.md`](resultats.md).

## Précision des cotes du service vision

Première mesure, le 18/11/2026, sur une vraie vidéo. Commande et méthode : `services/vision/README.md`.

### Conditions

| | |
|---|---|
| Vidéo | Visite de plusieurs pièces d'un logement de l'équipe, 31,5 s, 480 × 848 px, compressée par WhatsApp, sans feuille A4 |
| Découpage | 5 pièces, analysées séparément (tableau plus bas) |
| Images analysées | 104, choisies par score de netteté (environ 4 par seconde filmée) |
| Modèles | MoGe-2 (cotes), Grounding DINO base, SAM 2.1, MapAnything variante Apache (reconstruction), SigLIP base (vérification des points) |
| Machine | Mac M5 Pro, GPU Apple |
| Référence | Mètre ruban, relevé par Jean-Li |

### Points de précision

| Point | Dimension | Mesuré | Réel | Écart |
|---|---|---|---|---|
| 1. Porte de la chambre | Largeur de passage | 72,9 cm | 71,5 cm | +1,4 cm (+2,0 %) |
| 2. Porte d'entrée | Largeur de passage | 75,8 cm | relevé prévu le 18/11 au soir | à calculer |
| 2. Porte d'entrée | Hauteur | 203,5 cm | relevé prévu le 18/11 au soir | à calculer |
| 3. Tapis de la chambre | Longueur, largeur | pas de cote (hors cadre) | nouvelle vidéo et relevé prévus le 18/11 au soir | à calculer |

**1. Porte de la chambre, cote de référence.** Elle est vue en entier dans 6 images ; les 6 mesures tiennent dans ± 1,2 cm. Au premier passage, sur la vidéo entière et avec 2 vues seulement, le pipeline donnait 72,8 cm (+1,3 cm, +1,8 %).

**2. Porte d'entrée, en attente du relevé.** Elle est vue depuis le couloir, en entier dans 4 images sur 6 ; les 4 mesures de largeur tiennent dans ± 0,9 cm. Dans ces vues, un portant à vêtements passe devant le bas de la porte à droite, ce qui peut fausser la mesure. Filmée de près depuis l'entrée, la même porte est coupée par le cadre : pas de cote, partie visible 83 × 210 cm.

**3. Tapis de la chambre, en attente d'une vidéo où il est entier.**

Tant que les points 2 et 3 ne sont pas relevés, une seule cote est comparable : cela ne suffit pas pour annoncer une précision du pipeline.

Pour refaire le calcul : `python -m pipeline.precision --failles sorties/<nom>/failles.json --verite donnees/verite.json`, avec dans `verite.json` l'élément, sa pièce (`piece`), son numéro (`instance`) et la valeur relevée.

### Ce qui n'est pas une mesure de précision

- **Hauteur de la porte : 184,2 cm mesurés pour 198 cm réels.** Dans toutes les vues, le bas de la porte est caché par le lit. Le pipeline mesure la partie qu'il voit et ne sait pas détecter ce masquage. L'écart vient de la prise de vue, pas de l'échelle.
- **Fenêtre de la cuisine (150 × 166 cm réels) : hors cadre.** Elle est coupée par le bord de l'image dans ses 16 vues. Le pipeline n'annonce pas de cote : il la marque « à confirmer » et indique la partie visible, 134 × 160 cm.
- **Tapis de la chambre : hors cadre.** Il est coupé par le cadre dans ses 17 vues et n'a pas été relevé au mètre ruban. Cote « à confirmer », partie visible 78 × 158 cm.

### Découpage par pièce et reconstruction 3D

| Pièce | Segment de la vidéo | Images |
|---|---|---|
| Entrée | 0,0 à 2,2 s | 9 |
| Cuisine | 2,9 à 11,8 s | 30 |
| Couloir | 13,2 à 16,6 s, puis 27,8 à 31,5 s | 29 |
| Séjour | 17,0 à 19,4 s | 10 |
| Chambre | 21,0 à 27,6 s | 26 |

Les passages de porte entre deux pièces (images floues) ne sont dans aucun segment.

- **Vidéo entière** : MapAnything ne place pas les pièces de façon cohérente. La fenêtre de la cuisine et la porte de la chambre tombent au même endroit, et un même objet bouge d'environ 1 m d'une vue à la suivante.
- **Pièce par pièce** : la reconstruction de la chambre est cohérente. La porte y garde la même position sur ses 11 vues : 6 cm d'écart médian à la position médiane, 15 cm au plus. Le nuage de points montre le lit, la penderie, le tapis et le bureau à leur place.
- Les cotes ne dépendent pas de la reconstruction : elles sont mesurées vue par vue.

### Fausses détections relevées

- Le miroir de la chambre est pris pour une fenêtre et mesuré à 62 × 193 cm.
- Dans le séjour, un « tapis » de 39 × 140 cm est mesuré sur 2 vues ; il n'a pas été vérifié sur place.

Ces deux lignes ne sont pas dans le plan B de la démo.

### Temps de calcul (Mac M5 Pro)

| Passage | Images | Durée |
|---|---|---|
| Vidéo entière, avec reconstruction | 40 | 83 s |
| Pièce par pièce, avec une reconstruction par pièce | 104 | 184 s |

Détail du premier passage : détection 18,6 s, contours 2,5 s, points 3D métriques 16,5 s, reconstruction 35,7 s, chargement des modèles 7,6 s.

Comparaison du Mac et du GPU L4 du Space, modèle par modèle, sur des images de synthèse : `services/vision/README.md`, « Durées mesurées par l'auto-test ». Aucune vraie vidéo n'a encore été analysée sur le Space.

### Pour la prochaine vidéo

- Envoyer le fichier d'origine (AirDrop, câble ou Drive), pas une copie compressée par une messagerie.
- Une pièce à la fois, lentement : 30 à 60 s par pièce, pour que les images se recouvrent.
- Chaque objet à mesurer doit apparaître **en entier** pendant au moins 2 secondes, sous deux angles, sans meuble devant.
- Poser une feuille A4 au sol près du tapis : elle sert de référence d'échelle (`--calibrer-a4`).
- Relever au mètre ruban les trois objets, dont le tapis.
