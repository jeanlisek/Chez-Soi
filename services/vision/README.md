---
title: Chez Soi Vision
emoji: 🏠
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Chez Soi · service vision

À partir d'une vidéo du logement, le service produit les failles avec leurs cotes en centimètres, une image annotée et un modèle 3D (`.glb`). Il tourne en local (Mac Apple Silicon) et sur un Space Docker Hugging Face avec GPU.

## En local

```bash
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
uv pip install --python .venv/bin/python --no-deps -r requirements-modeles.txt
.venv/bin/python -m pytest -q
.venv/bin/python -m pipeline --video donnees/ma_video.mov --sortie sorties/essai --piece sejour
.venv/bin/python -m pipeline --video donnees/ma_video.mov --sortie sorties/essai --pieces donnees/pieces.json --reconstruction
```

`--pieces` donne le découpage de la vidéo : `[{"nom": "chambre", "debut_s": 21.0, "fin_s": 27.6}, …]`. Chaque pièce a alors sa propre analyse et sa propre reconstruction, dans `pieces/<pièce>/`, et un `failles.json` commun est écrit à la racine. Deux segments du même nom sont réunis. C'est le mode à utiliser dès que la vidéo montre plusieurs pièces : la reconstruction d'une vidéo entière n'est pas cohérente (voir `docs/mesures.md`).

Les vidéos vont dans `donnees/` et les résultats dans `sorties/` : les deux dossiers sont ignorés par git. Au premier lancement, les poids des modèles (environ 2,5 Go) sont téléchargés dans le cache Hugging Face. Si le téléchargement échoue sur une erreur « CAS Client Error », relancer avec `HF_HUB_DISABLE_XET=1`.

La commande écrit dans le dossier de sortie :

| Fichier | Contenu |
|---|---|
| `failles.json` | Une entrée par faille, aux colonnes de la table `failles` |
| `vues.json` | La mesure de chaque élément dans chaque image, avec son score (pour comprendre un résultat) |
| `image_annotee.jpg` | La vue de référence, avec le contour et la cote de chaque élément |
| `annotations/` | Chaque image analysée, annotée avec la mesure de cette vue |
| `modele.glb` | Nuage de points coloré de la vue de référence, en mètres |
| `images/` | Les images nettes extraites de la vidéo |

## Routes

| Route | Rôle |
|---|---|
| `GET /health` | État du service, présence du plan B et appareil de calcul vu par torch (`cuda`, `mps` ou `cpu`) |
| `POST /analyse {logement_id, video_url, piece?, pieces?}` | Répond 202 avec un `analyse_id` ; le calcul tourne en tâche de fond. `pieces` : `[{nom, debut_s, fin_s}]`, comme la table `pieces` |
| `GET /analyse/{analyse_id}` | `etat` (`en_cours`, `termine`, `echec`), `resultat` (`pipeline` ou `precalcule`), failles, liens des fichiers, et `pieces` (un modèle 3D et une image annotée par pièce) |
| `GET /analyse/{analyse_id}/fichiers/{chemin}` | `modele.glb`, `image_annotee.jpg` ou `failles.json`, à la racine ou dans `pieces/<pièce>/` |
| `POST /autotest`, puis `GET /autotest/{autotest_id}` | Diagnostic : charge les quatre modèles et les fait tourner sur des images de synthèse ; renvoie les durées par modèle. Fermé (403) tant que `VISION_API_KEY` n'est pas définie |
| `POST /contrat {contrat_id, pdf_url}` | Lecture du contrat, synchrone : assureur, formule, référence des conditions générales et obligations, chacune avec sa clause, sa page et sa citation. La réponse dit quel `moteur` a lu le PDF (`docling` ou `pypdf`) et, si c'est pypdf, pourquoi dans `repli` |

La reconstruction multi-vues est activée par `VISION_RECONSTRUCTION=1` (c'est le cas dans l'image Docker). `video_url` doit être en https (URL signée Supabase) et la vidéo peser 50 Mo au plus. Elle est supprimée du service dès la fin du calcul. Si `VISION_API_KEY` est définie, chaque appel doit envoyer l'en-tête `X-Vision-Key: <clé>`. L'en-tête `Authorization` n'est pas utilisé par le service : sur un Space privé, il porte le jeton Hugging Face.

**Plan B.** Si le calcul échoue et que `precalcule/demo/failles.json` existe, le service répond `termine` avec `resultat: "precalcule"` et sert les fichiers de ce dossier. Le champ `erreur` garde la cause de l'échec.

Le dépôt est public : de `precalcule/`, seul `failles.json` est suivi par git (règle dans `.gitignore`, vérifiée par `tests/test_plan_b.py`). Les images annotées et les `.glb` du plan B restent en local dans `precalcule/demo/pieces/<pièce>/` et partent vers le Space privé avec `deployer_space.py`. Aucune image, aucun `.glb` ni aucune vidéo d'un vrai logement ne va dans le dépôt.

Plan B actuel, figé le 18/11/2026 : 3 failles choisies dans la sortie du pipeline, valeurs non modifiées. La porte de la chambre est mesurée (72,9 × 184,2 cm) ; le tapis de la chambre et la fenêtre de la cuisine sont « à confirmer ». La ligne du tapis sera remplacée quand une vidéo le montrera en entier.

## Format de `failles.json`

Chaque entrée de `failles` reprend les colonnes de la table `failles` (migrations 0001, 0006 et 0007) : n8n peut l'insérer telle quelle, avec `logement_id`.

| Champ | Colonne | Contenu |
|---|---|---|
| `element`, `risque`, `source` | idem | `source` vaut toujours `vision` |
| `piece` | `piece` (0006) | Nom de la pièce ; le trigger de la base remplit `piece_id` |
| `cote_estimee_cm`, `marge_cm` | idem (0001) | Cote principale et sa dispersion entre les vues ; vides sans mesure fiable |
| `largeur_cm`, `longueur_cm`, `hauteur_cm` | idem (0006) | Détail de la cote ; vides sans mesure fiable |
| `origine` | idem (0007) | `pipeline` quand la cote est estimée, vide sinon |
| `position_3d` | idem (jsonb) | Position, image de référence et **statut de la cote** (ci-dessous) |

`cote_confirmee_cm`, `cotes_confirmees_le`, `gravite` et `priorite` ne viennent jamais de la vision.

### Statut de la cote : `position_3d.cote.statut`

C'est ce que l'écran du plan 3D doit lire pour savoir quoi afficher (issue #10).

| `statut` | Sens | À l'écran |
|---|---|---|
| `estimee` | Le pipeline a mesuré l'objet en entier | Afficher `cote_estimee_cm` (± `marge_cm`) et proposer de la confirmer |
| `a_confirmer` | L'objet se mesure, mais le pipeline n'a pas de cote fiable | Demander la cote à l'utilisateur ; elle ira dans `cote_confirmee_cm` |
| `sans_objet` | L'élément ne se mesure pas (serrure, détecteur) | Ne rien demander |

Pour `a_confirmer`, `position_3d.cote` contient aussi `raison` (`hors_cadre` : l'objet est coupé par le bord de l'image dans toutes les vues ; `non_mesurable`), un `message` prêt à afficher et, si elle existe, `partie_visible_cm`. **La partie visible est une indication, jamais une cote** : elle n'est écrite ni dans `cote_estimee_cm` ni dans `largeur_cm`, `longueur_cm`, `hauteur_cm`.

```json
{
  "element": "tapis",
  "piece": "chambre",
  "risque": "chute",
  "source": "vision",
  "origine": null,
  "cote_estimee_cm": null,
  "marge_cm": null,
  "largeur_cm": null,
  "longueur_cm": null,
  "hauteur_cm": null,
  "position_3d": {
    "centre": [
      -1.502,
      -0.787,
      -1.119
    ],
    "repere": "pieces/chambre/modele.glb",
    "instance": 0,
    "image_cle": "pieces/chambre/images/image_006.jpg",
    "boite_px": [
      2,
      576,
      448,
      844
    ],
    "nb_vues": 17,
    "nb_vues_entieres": 0,
    "cote": {
      "statut": "a_confirmer",
      "raison": "hors_cadre",
      "partie_visible_cm": {
        "largeur_cm": 77.9,
        "longueur_cm": 157.5
      },
      "message": "Cote à confirmer par l'utilisateur : l'objet est coupé par le cadre dans toutes les vues."
    }
  }
}
```

`position_3d.centre` est en mètres dans le repère glTF du fichier nommé par `repere`. `instance` numérote les objets du même type dans une pièce. Avec `--pieces`, le fichier a aussi une liste `pieces` : nom, segments, nombre d'images, chemin du `.glb` et de l'image annotée de chaque pièce.

## Lecture du contrat : moteur et repli

`POST /contrat` lit le PDF avec Docling quand il le peut, sinon avec pypdf. Le champ `repli` de la réponse dit pourquoi pypdf a servi ; il est vide quand Docling a lu le PDF.

| `repli` | Cas |
|---|---|
| `docling indisponible hors ligne` | `HF_HUB_OFFLINE=1` : Docling ne peut pas télécharger ses modèles, il n'est pas tenté. C'est le cas du Space |
| `docling non installé` | La bibliothèque n'est pas dans l'environnement |
| `docling en échec : <erreur>` | Docling a été tenté et a échoué |

Pour la démo, le Space lit donc les contrats avec pypdf, sans attendre l'échec de Docling (15 secondes par PDF auparavant). Docling n'est pas prêt : ses modèles ne sont ni figés sur une révision ni dans l'image, et sur un PDF fictif de deux pages il a rattaché tout le texte à la page 1, ce qui fausserait la page des clauses. Correction prévue après la démo.

## Ce que le pipeline mesure

| Élément | Cotes | Cote principale |
|---|---|---|
| Tapis | largeur, longueur | longueur |
| Porte | largeur, hauteur | largeur de passage |
| Fenêtre | largeur, hauteur | largeur |
| Serrure, escalier, éclairage, interrupteur, détecteur de fumée | aucune : présence et position (option `--presence`) | |

Chaque cote est la médiane entre les vues où l'élément est entier ; `marge_cm` est la dispersion entre ces vues (vide avec une seule vue). Une feuille A4 posée au sol sert de référence d'échelle (`--calibrer-a4`).

Règles qui évitent d'annoncer une fausse cote :

- **Élément coupé par le bord de l'image** : aucune cote. Il est marqué « à confirmer » (`position_3d.cote`), avec sa partie visible comme indication.
- **Élément masqué par un obstacle** : si une vue coupée du même objet en montre plus qu'une vue « entière », cette dernière est écartée.
- **Mesure invraisemblable** (porte de 34 cm de large, tapis de 18 cm) : la détection est écartée.
- **Fenêtre** : elle est mesurée sur le plan du mur qui l'entoure, car à travers la vitre les points 3D sont dehors.
- **Objets distincts** : un objet revu d'une image à la suivante reste le même ; deux portes vues à des moments différents donnent deux failles, numérotées dans `position_3d.instance`.

La détection des éléments mesurables (tapis, porte, fenêtre) utilise sa propre consigne, avec un seuil de 0,5. Les éléments de présence sont désactivés par défaut : sur une vidéo en basse définition, le détecteur en trouve partout.

Sans reconstruction, le `.glb` ne contient que la vue de référence. Avec `--reconstruction` (MapAnything), toutes les vues sont placées dans un même repère : le `.glb` couvre tout ce qui a été filmé et chaque faille y a sa position. Les cotes restent mesurées vue par vue avec MoGe-2. Si la reconstruction échoue, le résultat vue par vue est gardé et un avertissement est renvoyé. Sur une visite rapide de plusieurs pièces, la reconstruction n'est pas fiable (voir `docs/mesures.md`) : filmer une pièce à la fois. Un détecteur de fumée non vu n'est pas un détecteur absent.

## Modèles, révisions et licences

Chaque modèle est figé sur un commit de sa fiche Hugging Face dans [`modeles.py`](modeles.py). La licence est celle lue sur la fiche à cette révision, le 18/11/2026. Aucun modèle sous licence non commerciale.

| Modèle | Révision | Licence | Rôle |
|---|---|---|---|
| `Ruicheng/moge-2-vitl-normal` | `cb0e8bbd` | MIT | Points 3D métriques par image |
| `IDEA-Research/grounding-dino-base` | `12bdfa31` | Apache 2.0 | Détection |
| `facebook/sam2.1-hiera-small` | `ee5bba1d` | Apache 2.0 | Contour des éléments |
| `facebook/map-anything-apache` | `00f9c245` | Apache 2.0 | Reconstruction multi-vues (option `--reconstruction`) |
| `depth-anything/DA3-BASE` | `f4a6c9b3` | Apache 2.0 | Secours (pas encore branché) |
| `depth-anything/DA3METRIC-LARGE` | `4010e39f` | Apache 2.0 | Secours (pas encore branché) |

`facebook/map-anything-apache` : les révisions de la fiche datées du 18/12/2025 au 20/01/2026 indiquaient `cc-by-nc-4.0`. La révision retenue (04/02/2026) indique `apache-2.0`. Ne pas revenir à une révision antérieure.

Code des modèles : MoGe (`microsoft/MoGe`, commit `74fbce05`) est sous licence MIT, avec le code DINOv2 qu'il embarque sous Apache 2.0. Il est installé sans ses dépendances déclarées (gradio, flex-gemm et un paquet nommé `pipeline`), dont l'inférence n'a pas besoin.

MapAnything charge le code de DINOv2 par `torch.hub`, qui prend par défaut la branche `main` du dépôt `facebookresearch/dinov2`. Le service détourne cet appel vers une copie du dépôt figée sur le commit `7764ea0f` (licence Apache 2.0, lue dans son fichier `LICENSE` à ce commit), notée dans `modeles.py`. Cette copie est téléchargée une fois, puis lue sans réseau ; dans l'image Docker, elle est téléchargée à la construction.

Mesuré sur un Mac M5 Pro (GPU Apple), images de synthèse : MapAnything traite 30 vues en 16,5 s, avec environ 10 Go de mémoire.

### Bibliothèques que MapAnything installe

Le code de MapAnything est sous Apache 2.0, mais ses dépendances ne le sont pas toutes. Licences relevées sur PyPI le 18/11/2026 :

| Bibliothèque | Licence | Remarque |
|---|---|---|
| `plyfile` | **GPL v3 ou ultérieure** | Pas installée : MapAnything est installé sans ses dépendances, et l'export passe par trimesh |
| `uniception` 0.1.7 | BSD 3-Clause | |
| `rerun-sdk` | Non renseignée sur PyPI | Outil de visualisation, pas nécessaire à l'inférence : pas installé |
| `orjson` | MPL 2.0 et (Apache 2.0 ou MIT) | |
| `tqdm` | MPL 2.0 et MIT | |
| `pillow-heif` | BSD 3-Clause | Les bibliothèques HEIF qu'il embarque sont à vérifier avant usage |
| `hydra-core`, `natsort`, `python-box`, `trimesh` | MIT | |
| `opencv-python-headless`, `requests`, `safetensors`, `huggingface_hub`, `timm` | Apache 2.0 | |
| `tensorboard` | Apache 2.0 | Pas installé (inutile à l'inférence) |
| `einops`, `jaxtyping`, `termcolor` | MIT | Dépendances d'uniception |
| `scikit-learn`, `omegaconf`, `antlr4-python3-runtime` | BSD | |
| `matplotlib` | Licence matplotlib (type PSF) | |

## Space Hugging Face

```bash
.venv/bin/python deployer_space.py --space <compte>/chez-soi-vision
.venv/bin/python deployer_space.py --space <compte>/chez-soi-vision --confirmer
.venv/bin/python deployer_space.py --space <compte>/chez-soi-vision --materiel l4x1 --confirmer
```

Sans `--confirmer`, le script n'envoie rien : il affiche la liste des fichiers qui partiraient. Si le Space existe et n'est pas privé, il refuse d'envoyer (le plan B contient des images d'un vrai logement). `HF_TOKEN` est lu dans l'environnement ou dans le `.env` (option `--env`), jamais affiché. Le Space est privé par défaut. `--materiel` demande un GPU payant, avec mise en veille après 30 minutes d'inactivité. L'image télécharge les poids et le code DINOv2 à la construction, aux révisions figées, et démarre sans réseau (`HF_HUB_OFFLINE=1`).

Le jeton doit avoir l'écriture sur le Space. S'il ne peut pas créer de Space, créer `<compte>/chez-soi-vision` à la main (Docker, privé) : le script envoie alors le code dans le Space existant.

Variables du Space :

| Variable | Où | Rôle |
|---|---|---|
| `HF_HUB_OFFLINE=1` | Dockerfile | Aucun téléchargement au démarrage |
| `VISION_RECONSTRUCTION=1` | Dockerfile | Active MapAnything |
| `VISION_API_KEY` | Secret du Space, facultatif | Clé attendue dans `X-Vision-Key` ; envoyée par `deployer_space.py` si elle est dans le `.env` |
| `VISION_SORTIES` | Facultatif | Dossier des résultats (par défaut `/tmp/chez-soi-vision`) |

Le Space n'a besoin d'aucun jeton Hugging Face ni d'aucune clé Supabase. Côté appelant (n8n) : `VISION_SERVICE_URL=https://<compte>-chez-soi-vision.hf.space`, et comme le Space est privé, chaque appel porte `Authorization: Bearer <jeton Hugging Face en lecture sur le Space>`.

Les résultats sont gardés en mémoire et dans `/tmp` : ils sont perdus quand le Space se met en veille. n8n doit donc récupérer les fichiers dès que l'analyse est terminée.

Vidéos : uniquement celles de l'équipe, jamais dans le dépôt.

## Appeler le service depuis n8n (`pipeline_analyse`, issue #22)

### Adresse et en-têtes

Adresse du Space : `https://jeanlisek-chez-soi-vision.hf.space`. Le Space est privé : sans jeton, il répond 404.

Chaque appel porte **deux en-têtes**, qui ne se remplacent pas l'un l'autre :

| En-tête | Valeur | Rôle |
|---|---|---|
| `Authorization` | `Bearer <jeton Hugging Face en lecture sur le Space>` | Ouvre le Space privé. Sans lui : 404, la requête n'atteint pas le service |
| `X-Vision-Key` | `<VISION_API_KEY>` | Clé du service. Sans elle, ou fausse : 401 |

Les deux valeurs passent par des credentials n8n, jamais en dur dans un nœud : le dépôt est public. `GET /health` ne demande que le jeton.

### Déroulé

1. **Réveiller le Space.** Appeler `GET /health` jusqu'à obtenir 200 avec `"status": "ok"`. Après une mise en veille, le premier appel relance le Space. Le délai est très variable : 4 à 6 minutes lors de trois redémarrages le 18/11/2026, mais **33 minutes** lors d'un quatrième (dont 30 minutes en démarrage, cause inconnue). Prévoir donc jusqu'à 35 minutes, avec un nouvel essai toutes les 20 à 30 secondes, et réveiller le Space bien avant une démonstration. Pendant le réveil, l'appel peut échouer ou ne pas répondre (codes exacts non relevés) : traiter toute réponse autre que 200 comme « pas encore prêt ».
2. **Lancer l'analyse.** `POST /analyse` avec l'URL https signée de la vidéo (bucket privé `videos`) :

   ```json
   {
     "logement_id": "<uuid du logement>",
     "video_url": "https://<projet>.supabase.co/storage/v1/object/sign/videos/...",
     "pieces": [{"nom": "chambre", "debut_s": 0, "fin_s": 45}]
   }
   ```

   Réponse : **202** avec `analyse_id` et `"etat": "en_cours"`. Une URL qui n'est pas en https ou une pièce dont la fin précède le début donnent 422. Une vidéo par pièce (issue #22) : le champ `pieces` contient alors un seul segment, qui couvre la vidéo.
3. **Interroger l'état.** `GET /analyse/{analyse_id}` toutes les 10 secondes, 15 minutes au plus. Tant que `etat` vaut `en_cours`, attendre. Relancer la requête sur une erreur 5xx. Un **404 « Analyse inconnue »** veut dire que le Space a redémarré et a perdu l'analyse : repartir de l'étape 2.
4. **Récupérer les fichiers tout de suite**, dans la même exécution du workflow. Le service garde les résultats en mémoire et dans `/tmp` : ils sont perdus à la mise en veille (30 minutes sans requête) et à chaque redémarrage. Quand `etat` vaut `termine` :
   - les failles sont dans la réponse elle-même, champ `failles` ;
   - pour chaque entrée de `pieces`, télécharger `modele_3d_url` et `image_annotee_url` (chemins relatifs à l'adresse du Space, mêmes en-têtes, réponse binaire) et les déposer dans le bucket privé `modeles3d`, sous `{user_id}/{logement_id}/` ;
   - `GET /analyse/{analyse_id}/fichiers/failles.json` donne le fichier complet, si on veut l'archiver.
5. **Lire d'où vient le résultat.** `resultat` vaut `pipeline` (calcul réussi) ou `precalcule` (le calcul a échoué, le service a servi le plan B ; `erreur` en garde la cause). Le workflow doit le noter dans ce qu'il renvoie. Si `etat` vaut `echec`, il n'y a ni résultat ni plan B : c'est le cas d'une vidéo trop lourde, ou d'un calcul en échec sans plan B disponible. `erreur` dit lequel.
6. **Écrire dans Supabase** avec la clé `service_role` : une ligne de `failles` par entrée, en ajoutant `logement_id`. Le format et la correspondance avec les colonnes sont décrits plus haut (« Format de `failles.json` »). `piece` s'écrit par son nom, `origine` vaut `pipeline` ou reste vide, `position_3d` s'écrit tel quel : il porte le statut « à confirmer ».

### À savoir

- **Une analyse à la fois.** Les demandes suivantes attendent leur tour dans le service.
- **La vidéo** est téléchargée par le service puis supprimée dès la fin du calcul. Au-delà de **50 Mo** (la limite du bucket `videos`), le service la refuse : `etat` vaut `echec`, `erreur` commence par « Vidéo trop lourde », et le plan B n'est **pas** servi à la place. Le message donne le repère : une vidéo par pièce, environ 30 secondes en 720p.
- **La première analyse après un réveil** charge les modèles avant de calculer (durées mesurées ci-dessous).
- **Chaque requête repousse la mise en veille.** Tant que le workflow interroge l'état, le Space reste éveillé.

Essai à la main :

```bash
curl -s -H "Authorization: Bearer $HF_TOKEN" https://jeanlisek-chez-soi-vision.hf.space/health
```

```bash
curl -s -X POST -H "Authorization: Bearer $HF_TOKEN" -H "X-Vision-Key: $VISION_API_KEY" -H "Content-Type: application/json" -d '{"logement_id": "demo", "video_url": "https://..."}' https://jeanlisek-chez-soi-vision.hf.space/analyse
```

### Durées mesurées par l'auto-test

`POST /autotest` sur le Space (ou `python -m pipeline.autotest` en local) charge les quatre modèles et les fait tourner sur 4 images de synthèse de 1280 × 720. Mesures du 18/11/2026 :

| Modèle | Chargement Mac | Chargement L4 | Calcul Mac | Calcul L4 |
|---|---|---|---|---|
| Grounding DINO (détection) | 0,9 s | 1,2 s | 0,48 s par image | 0,28 s par image |
| SAM 2.1 (contours) | 0,2 s | 0,2 s | 0,11 s par image | 0,06 s par image |
| MoGe-2 (points 3D métriques) | 2,6 s | 4,3 s | 0,79 s par image | 0,22 s par image |
| MapAnything (reconstruction) | 14,1 s | 16,8 s | 1,68 s pour 4 vues | 0,86 s pour 4 vues |
| **Total du chargement** | **17,8 s** | **22,5 s** | | |

Mac : M5 Pro, GPU Apple. L4 : Space `l4x1`, torch 2.15 avec CUDA 13. Le calcul est celui d'un modèle déjà en route ; le tout premier appel de chaque modèle est plus lent (1,2 s pour la détection sur le L4). Sur le L4, les quatre modèles chargés ensemble occupent au plus 8,8 Go de mémoire GPU sur 24.

Ce que ça donne pour n8n : la première analyse après un réveil ajoute environ 23 s de chargement, les suivantes aucune. Pour 30 images, détection, contours et points 3D prennent environ 17 s sur le L4 (calcul à partir des durées par image). La reconstruction à 30 vues n'a pas été mesurée sur le L4 ; elle prend 16,5 s sur le Mac. Ces durées viennent d'images de synthèse : la première vraie analyse sur le GPU du Space reste à faire.

Un redéploiement complet (reconstruction de l'image puis redémarrage sur le L4) a pris 3,8 minutes.
