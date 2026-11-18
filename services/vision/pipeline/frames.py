"""Extraction des images nettes de la vidéo (OpenCV)."""

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class ImageExtraite:
    chemin: Path
    indice: int
    temps_s: float
    nettete: float


def score_nettete(image_gris: np.ndarray) -> float:
    """Variance du Laplacien : plus elle est haute, plus l'image est nette."""
    return float(cv2.Laplacian(image_gris, cv2.CV_64F).var())


def choisir_images(scores: list[float], nb: int) -> list[int]:
    """Découpe la suite en `nb` tranches de temps et garde l'image la plus nette de chacune."""
    if len(scores) <= nb:
        return list(range(len(scores)))
    bornes = np.linspace(0, len(scores), nb + 1).astype(int)
    return [int(debut + np.argmax(scores[debut:fin])) for debut, fin in zip(bornes[:-1], bornes[1:])]


def _reduire(image: np.ndarray, cote_max: int) -> np.ndarray:
    echelle = cote_max / max(image.shape[:2])
    if echelle >= 1:
        return image
    return cv2.resize(image, None, fx=echelle, fy=echelle, interpolation=cv2.INTER_AREA)


def extraire_images(
    video: Path, sortie: Path, nb: int = 30, pas_s: float = 0.2, cote_max: int = 1920,
    debut_s: float | None = None, fin_s: float | None = None, premier_numero: int = 0,
) -> list[ImageExtraite]:
    """Écrit dans `sortie` les `nb` images les plus nettes, réparties sur la vidéo ou sur le segment [debut_s, fin_s].

    Les fichiers sont numérotés à partir de `premier_numero`, pour enchaîner plusieurs segments d'une même pièce.
    """
    lecture = cv2.VideoCapture(str(video))
    if not lecture.isOpened():
        raise ValueError(f"Vidéo illisible : {video}")
    fps = lecture.get(cv2.CAP_PROP_FPS) or 30.0
    pas = max(1, round(pas_s * fps))

    candidats: list[tuple[int, float]] = []
    indice = 0
    while lecture.grab():
        temps = indice / fps
        if fin_s is not None and temps > fin_s:
            break
        if indice % pas == 0 and (debut_s is None or temps >= debut_s):
            ok, image = lecture.retrieve()
            if ok:
                gris = cv2.cvtColor(_reduire(image, 640), cv2.COLOR_BGR2GRAY)
                candidats.append((indice, score_nettete(gris)))
        indice += 1
    lecture.release()
    if not candidats:
        raise ValueError(f"Aucune image lue dans la vidéo : {video}")

    retenus = {candidats[i][0]: candidats[i][1] for i in choisir_images([s for _, s in candidats], nb)}

    sortie.mkdir(parents=True, exist_ok=True)
    images: list[ImageExtraite] = []
    lecture = cv2.VideoCapture(str(video))
    indice = 0
    while lecture.grab() and len(images) < len(retenus):
        if indice in retenus:
            ok, image = lecture.retrieve()
            if ok:
                chemin = sortie / f"image_{premier_numero + len(images):03d}.jpg"
                cv2.imwrite(str(chemin), _reduire(image, cote_max), [cv2.IMWRITE_JPEG_QUALITY, 95])
                images.append(ImageExtraite(chemin, indice, indice / fps, retenus[indice]))
        indice += 1
    lecture.release()
    return images
