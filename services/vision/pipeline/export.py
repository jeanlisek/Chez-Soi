"""Export des résultats : failles.json, image annotée et nuage de points .glb."""

import json
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

_COULEUR = (255, 138, 0)  # orange, en RVB


class Faille(BaseModel):
    """Une ligne de la table `failles` (issue #1), telle que la vision peut la remplir."""

    element: str
    piece: str | None = None
    risque: Literal["chute", "intrusion", "incendie", "autre"]
    source: Literal["vision", "declaration"] = "vision"
    origine: Literal["pipeline", "manuel"] | None = None  # vide quand la faille n'a pas de cote (migration 0007)
    cote_estimee_cm: float | None = None
    marge_cm: float | None = None
    largeur_cm: float | None = None
    longueur_cm: float | None = None
    hauteur_cm: float | None = None
    position_3d: dict = Field(default_factory=dict)


def ecrire_failles(
    failles: list[Faille], chemin: Path, logement_id: str, modele_3d: str | None, pieces: list[dict] | None = None
) -> Path:
    contenu = {"logement_id": logement_id, "modele_3d": modele_3d}
    if pieces is not None:
        contenu["pieces"] = pieces
    contenu["failles"] = [f.model_dump() for f in failles]
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(contenu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return chemin


NOMS_AFFICHES = {
    "fenetre": "fenêtre", "eclairage": "éclairage", "detecteur_fumee": "détecteur de fumée", "feuille_a4": "feuille A4",
}


def libelle_cote(
    element: str, largeur_cm: float | None = None, longueur_cm: float | None = None, hauteur_cm: float | None = None
) -> str:
    """« tapis 61 × 158 cm » : largeur, puis longueur, puis hauteur, arrondies au centimètre."""
    cotes = [f"{round(c)}" for c in (largeur_cm, longueur_cm, hauteur_cm) if c is not None]
    nom = NOMS_AFFICHES.get(element, element)
    return f"{nom} {' × '.join(cotes)} cm" if cotes else nom


def libelle_partiel(element: str, visible_cm: dict | None) -> str:
    """Élément sans cote fiable (coupé par le cadre) : on annonce une cote à confirmer, et ce qui est visible."""
    nom = NOMS_AFFICHES.get(element, element)
    if not visible_cm:
        return f"{nom} · cote à confirmer"
    cotes = " × ".join(f"{round(c)}" for c in visible_cm.values())
    return f"{nom} · cote à confirmer (visible : {cotes} cm)"


def placer_libelle(x: int, y: int, largeur: int, hauteur: int, occupes: list, hauteur_image: int) -> tuple[int, int]:
    """Descend le libellé tant qu'il recouvre un libellé déjà posé, puis réserve sa place dans `occupes`."""
    def recouvre(autre) -> bool:
        ax, ay, al, ah = autre
        return x < ax + al and ax < x + largeur and y < ay + ah and ay < y + hauteur

    while any(recouvre(autre) for autre in occupes) and y + 2 * hauteur <= hauteur_image:
        y += hauteur
    occupes.append((x, y, largeur, hauteur))
    return x, y


_POLICES = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",  # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # image Docker (paquet fonts-dejavu-core)
)


def _police(taille: int):
    """Police qui sait écrire « × » et les accents ; sinon la police par défaut, avec un « x » à la place."""
    for chemin in _POLICES:
        if Path(chemin).exists():
            return ImageFont.truetype(chemin, taille), True
    return ImageFont.load_default(size=taille), False


def annoter_image(image_bgr: np.ndarray, annotations: list[dict], largeur_min: int = 0) -> np.ndarray:
    """Dessine sur une copie le contour, la boîte et le libellé de chaque élément (`libelle`, `boite_px`, `masque`).

    Une image plus étroite que `largeur_min` est agrandie avant le dessin, pour que le texte reste lisible.
    """
    echelle = max(1.0, largeur_min / image_bgr.shape[1])
    if echelle > 1:
        image_bgr = cv2.resize(image_bgr, None, fx=echelle, fy=echelle, interpolation=cv2.INTER_CUBIC)
    rvb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    for annotation in annotations:
        masque = annotation.get("masque")
        if masque is not None:
            if echelle > 1:
                masque = cv2.resize(masque.astype(np.uint8), rvb.shape[1::-1], interpolation=cv2.INTER_NEAREST).astype(bool)
            rvb[masque] = (0.7 * rvb[masque] + 0.3 * np.array(_COULEUR)).astype(np.uint8)
    image = Image.fromarray(rvb)
    dessin = ImageDraw.Draw(image)
    trait = max(2, image.height // 300)
    police, complete = _police(max(18, image.height // 48))
    occupes: list[tuple[int, int, int, int]] = []
    for annotation in annotations:
        x1, y1, x2, y2 = (int(v * echelle) for v in annotation["boite_px"])
        if not complete:
            annotation = {**annotation, "libelle": annotation["libelle"].replace("×", "x")}
        dessin.rectangle((x1, y1, x2, y2), outline=_COULEUR, width=trait)
        gauche, haut, droite, bas = dessin.textbbox((0, 0), annotation["libelle"], font=police)
        marge = trait * 3
        largeur, hauteur = droite - gauche + 2 * marge, bas - haut + 2 * marge
        x = min(max(0, x1), max(0, image.width - largeur))
        y = y1 - hauteur if y1 - hauteur >= 0 else y1
        x, y = placer_libelle(x, y, largeur, hauteur, occupes, image.height)
        dessin.rectangle((x, y, x + largeur, y + hauteur), fill=_COULEUR)
        dessin.text((x + marge - gauche, y + marge - haut), annotation["libelle"], fill=(0, 0, 0), font=police)
    return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)


def vers_repere_glb(points: np.ndarray) -> np.ndarray:
    """Repère caméra OpenCV (y vers le bas, z vers l'avant) → repère glTF (y vers le haut, z vers l'arrière)."""
    return np.asarray(points, float) * np.array([1.0, -1.0, -1.0])


def exporter_glb(points: np.ndarray, couleurs_rvb: np.ndarray, chemin: Path) -> Path:
    """Écrit un nuage de points coloré au format .glb (points déjà dans le repère glTF, en mètres)."""
    opaque = np.full((len(points), 1), 255, np.uint8)
    nuage = trimesh.PointCloud(np.asarray(points, float), colors=np.hstack([couleurs_rvb.astype(np.uint8), opaque]))
    chemin.parent.mkdir(parents=True, exist_ok=True)
    trimesh.Scene(nuage).export(chemin)
    return chemin
