"""Auto-test : charge les quatre modèles sur l'appareil de calcul et les fait tourner sur des images de synthèse.

Aucune vidéo ni image réelle n'est utilisée. Sert à vérifier un déploiement et à comparer deux machines :
python -m pipeline.autotest
"""

import json
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np


def images_de_synthese(nb: int = 4, largeur: int = 1280, hauteur: int = 720) -> list[np.ndarray]:
    """Vues décalées d'une même scène dessinée : un sol, un mur, un rectangle rouge posé au sol. Images en RVB."""
    bruit = np.random.default_rng(0).integers(0, 40, (hauteur, largeur, 3), dtype=np.uint8)
    images = []
    for i in range(nb):
        decalage = 60 * i
        image = np.full((hauteur, largeur, 3), 200, np.uint8)
        image[: int(hauteur * 0.42)] = (225, 225, 215)
        image = cv2.subtract(image, bruit)
        tapis = np.array([[420 - decalage, 470], [860 - decalage, 470], [1000 - 1.3 * decalage, 640],
                          [280 - 1.3 * decalage, 640]], np.int32)
        cv2.fillPoly(image, [tapis], (40, 40, 170))
        images.append(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    return images


def _chrono(calcul):
    debut = time.perf_counter()
    resultat = calcul()
    return resultat, time.perf_counter() - debut


def _serie(calcul, images) -> dict:
    """Premier calcul (qui inclut la mise en route du modèle), puis moyenne des suivants."""
    durees = [_chrono(lambda image=image: calcul(image))[1] for image in images]
    return {"premier_calcul_s": round(durees[0], 2), "calcul_moyen_s": round(float(np.mean(durees[1:])), 3),
            "unite": "par image"}


def lancer_autotest(nb_images: int = 4) -> dict:
    import torch

    from modeles import GROUNDING_DINO, MAPANYTHING, MOGE, SAM

    from .analyse import charger_modeles, charger_reconstructeur, choisir_appareil
    from .detection import SEUIL_COTES, TERMES_COTES, Detection

    debut = time.perf_counter()
    appareil = choisir_appareil()
    deja_en_memoire = charger_modeles.cache_info().currsize > 0
    detecteur, profondeur = charger_modeles(appareil)
    reconstructeur = charger_reconstructeur(appareil)
    images = images_de_synthese(nb_images)

    def contours(image):
        boite = Detection("tapis", "chute", 1.0, (280, 470, 1000, 640))
        detecteur.ajouter_masques(image, [boite])
        return boite.masque

    detection = _serie(lambda image: detecteur.detecter(image, TERMES_COTES, SEUIL_COTES), images)
    contour = _serie(contours, images)
    points = _serie(profondeur.points, images)
    with tempfile.TemporaryDirectory() as dossier:
        chemins = []
        for i, image in enumerate(images):
            chemins.append(Path(dossier) / f"vue_{i}.jpg")
            cv2.imwrite(str(chemins[-1]), cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
        reconstruit, premiere = _chrono(lambda: reconstructeur.reconstruire(chemins))
        _, seconde = _chrono(lambda: reconstructeur.reconstruire(chemins))

    def fiche(modele, role, chargement_s, durees) -> dict:
        return {"modele": modele.depot, "revision": modele.revision[:8], "role": role,
                "chargement_s": round(chargement_s, 1), **durees}

    resultat = {
        "appareil": appareil,
        "gpu": torch.cuda.get_device_name(0) if appareil == "cuda" else None,
        "torch": torch.__version__,
        "nb_images": nb_images,
        "modeles_deja_en_memoire": deja_en_memoire,
        "modeles": [
            fiche(GROUNDING_DINO, "détection", detecteur.durees_chargement_s["grounding_dino"], detection),
            fiche(SAM, "contours", detecteur.durees_chargement_s["sam"], contour),
            fiche(MOGE, "points 3D métriques", profondeur.duree_chargement_s, points),
            fiche(MAPANYTHING, "reconstruction multi-vues", reconstructeur.duree_chargement_s,
                  {"premier_calcul_s": round(premiere, 2), "calcul_moyen_s": round(seconde, 2),
                   "unite": f"pour {nb_images} vues"}),
        ],
        "controles": {
            "masque_px": int(contours(images[0]).sum()),
            "points_valides": round(float(np.isfinite(profondeur.points(images[0])).all(axis=-1).mean()), 2),
            "vues_reconstruites": int(len(reconstruit.points)),
        },
        "memoire_gpu_max_go": round(torch.cuda.max_memory_allocated() / 1e9, 1) if appareil == "cuda" else None,
    }
    resultat["chargement_total_s"] = round(sum(m["chargement_s"] for m in resultat["modeles"]), 1)
    resultat["total_s"] = round(time.perf_counter() - debut, 1)
    return resultat


if __name__ == "__main__":
    print(json.dumps(lancer_autotest(), ensure_ascii=False, indent=2))
