"""Deuxième avis sur chaque point repéré : un modèle qui relie images et textes (SigLIP) regarde la photo du point.

Grounding DINO trouve les éléments à partir d'un mot (« smoke detector ») et confond parfois des objets proches :
une pomme de douche prise pour un détecteur de fumée, une poignée de placard prise pour une serrure.
Ici, on découpe le point sur ses meilleures images et on demande à SigLIP s'il ressemble plus à l'élément annoncé
qu'aux confusions connues. Un point qui ressemble surtout à une confusion est retiré avant d'arriver dans l'app.
"""

from collections import defaultdict
from dataclasses import dataclass

import numpy as np

# Élément → (ce qu'il doit être, ce avec quoi le détecteur le confond). Textes en anglais : SigLIP est entraîné en anglais.
DESCRIPTIONS: dict[str, tuple[list[str], list[str]]] = {
    "tapis": (
        ["a rug on the floor", "a doormat", "a bath mat", "a carpet runner"],
        ["a bare wooden floor", "a tiled floor", "a shower tray", "a towel", "a sofa"],
    ),
    "porte": (
        ["a door", "an open doorway", "an apartment front door"],
        ["a wardrobe", "a kitchen cabinet", "a mirror", "a painted wall"],
    ),
    "fenetre": (
        ["a window", "a french window", "a window with shutters"],
        ["a mirror", "a picture frame", "a television screen", "a shower screen"],
    ),
    "serrure": (
        ["a door lock with a keyhole", "a door handle on a front door", "a deadbolt lock"],
        ["a kitchen cabinet handle", "a drawer handle", "a towel rail", "a tap", "a light switch"],
    ),
    "escalier": (
        ["a staircase", "stairs"],
        ["a floor", "a bookshelf", "a radiator", "a door"],
    ),
    "eclairage": (
        ["a ceiling light", "a light fixture", "a lamp"],
        ["a shower head", "a smoke detector", "a plain ceiling", "a window"],
    ),
    "detecteur_fumee": (
        ["a smoke detector on the ceiling", "a smoke alarm"],
        ["a shower head", "a ceiling light", "a plain ceiling", "an air vent", "a speaker"],
    ),
    "interrupteur": (
        ["a light switch on a wall", "a wall socket"],
        ["a door handle", "a picture frame", "a plain wall"],
    ),
}

SEUIL = 0.5  # part minimale de « ce qu'il doit être » dans la réponse du modèle, en moyenne sur les vues
NB_VUES_MAX = 3  # vues regardées par point : les plus grandes boîtes
MARGE = 0.25  # contexte autour de la boîte (un détecteur se reconnaît mieux avec un bout de plafond)
COTE_MIN_PX = 96  # découpe minimale : en dessous, le modèle ne voit qu'une tache


@dataclass
class Avis:
    score: float  # part moyenne de « ce qu'il doit être », entre 0 et 1
    nb_vues: int
    garde: bool
    confusion: str | None = None  # description la plus probable parmi les confusions, si le point est retiré


def decouper(image: np.ndarray, boite_px: tuple[int, int, int, int], marge: float = MARGE,
             cote_min: int = COTE_MIN_PX) -> np.ndarray:
    """La boîte élargie de `marge` de chaque côté, et d'au moins `cote_min` pixels, sans sortir de l'image."""
    hauteur, largeur = image.shape[:2]
    x1, y1, x2, y2 = boite_px
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    demi_l = max((x2 - x1) * (1 + 2 * marge), cote_min) / 2
    demi_h = max((y2 - y1) * (1 + 2 * marge), cote_min) / 2
    gx1, gx2 = int(max(0, cx - demi_l)), int(min(largeur, cx + demi_l))
    gy1, gy2 = int(max(0, cy - demi_h)), int(min(hauteur, cy + demi_h))
    return image[gy1:gy2, gx1:gx2]


def avis(probabilites: list[np.ndarray], positifs: list[str], negatifs: list[str], seuil: float = SEUIL) -> Avis:
    """Réunit les réponses du modèle sur plusieurs vues d'un même point (probabilités sur positifs + négatifs)."""
    parts = [float(p[: len(positifs)].sum()) for p in probabilites]
    score = float(np.mean(parts))
    garde = score >= seuil
    confusion = None
    if not garde:
        moyenne = np.mean(probabilites, axis=0)
        confusion = negatifs[int(np.argmax(moyenne[len(positifs):]))]
    return Avis(round(score, 3), len(probabilites), garde, confusion)


class Verificateur:
    """Charge SigLIP à la révision figée dans modeles.py."""

    def __init__(self, appareil: str):
        import time

        import torch
        from transformers import AutoModel, AutoProcessor

        from modeles import SIGLIP

        debut = time.perf_counter()
        self.torch = torch
        self.appareil = appareil
        self.processeur = AutoProcessor.from_pretrained(SIGLIP.depot, revision=SIGLIP.revision)
        self.modele = AutoModel.from_pretrained(SIGLIP.depot, revision=SIGLIP.revision).to(appareil).eval()
        self.duree_chargement_s = time.perf_counter() - debut

    def probabilites(self, decoupes: list[np.ndarray], textes: list[str]) -> list[np.ndarray]:
        """Pour chaque découpe (RVB), la répartition des probabilités entre les textes."""
        from PIL import Image

        images = [Image.fromarray(d) for d in decoupes]
        entrees = self.processeur(text=[f"a photo of {t}" for t in textes], images=images,
                                  padding="max_length", return_tensors="pt").to(self.appareil)
        with self.torch.no_grad():
            logits = self.modele(**entrees).logits_per_image
        # SigLIP note chaque texte séparément (sigmoïde) ; on compare ici les textes entre eux.
        return list(logits.softmax(dim=-1).float().cpu().numpy())


def verifier_failles(failles: list, mesures: list, images_rvb, verificateur, seuil: float = SEUIL) -> tuple[list, list]:
    """Retire les points que SigLIP voit surtout comme une confusion connue. Renvoie (gardées, retirées).

    `images_rvb(nom)` rend l'image RVB d'après son nom de fichier. Chaque faille regardée reçoit
    `position_3d["verification"]`. Un élément sans description (feuille A4…) est gardé sans vérification.
    """
    par_objet: dict[tuple[str, int], list] = defaultdict(list)
    for mesure in mesures:
        par_objet[(mesure.element, mesure.instance)].append(mesure)

    gardees, retirees = [], []
    for faille in failles:
        if faille.element not in DESCRIPTIONS:
            gardees.append(faille)
            continue
        positifs, negatifs = DESCRIPTIONS[faille.element]
        vues = sorted(
            par_objet.get((faille.element, faille.position_3d.get("instance")), []),
            key=lambda m: (m.boite_px[2] - m.boite_px[0]) * (m.boite_px[3] - m.boite_px[1]), reverse=True,
        )[:NB_VUES_MAX]
        decoupes = [d for m in vues if (img := images_rvb(m.image)) is not None
                    and (d := decouper(img, m.boite_px)).size]
        if not decoupes:
            gardees.append(faille)
            continue
        resultat = avis(verificateur.probabilites(decoupes, positifs + negatifs), positifs, negatifs, seuil)
        faille.position_3d["verification"] = {"modele": "siglip", "score": resultat.score, "nb_vues": resultat.nb_vues,
                                              **({"confusion": resultat.confusion} if resultat.confusion else {})}
        (gardees if resultat.garde else retirees).append(faille)
    return gardees, retirees
