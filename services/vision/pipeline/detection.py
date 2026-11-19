"""Détection des éléments du logement (Grounding DINO) et contour précis de chacun (SAM 2.1)."""

from dataclasses import dataclass

import numpy as np

# Terme anglais donné au détecteur → (élément, risque). La feuille A4 n'est pas une faille : c'est la référence d'échelle.
ELEMENTS: dict[str, tuple[str, str]] = {
    "rug": ("tapis", "chute"),
    # Une porte compte pour le risque de chute : son passage utile limite un fauteuil ou un déambulateur.
    "door": ("porte", "chute"),
    "window": ("fenetre", "intrusion"),
    "door lock": ("serrure", "intrusion"),
    "staircase": ("escalier", "chute"),
    "ceiling light": ("eclairage", "chute"),
    "light switch": ("interrupteur", "chute"),
    "smoke detector": ("detecteur_fumee", "incendie"),
    "sheet of paper": ("feuille_a4", "autre"),
}
_TERMES = sorted(ELEMENTS, key=len, reverse=True)
# Le détecteur est plus sûr de lui avec peu de termes : les éléments qui se mesurent ont leur propre consigne.
TERMES_COTES = ["rug", "door", "window"]
TERME_REFERENCE = "sheet of paper"
TERMES_PRESENCE = ["door lock", "staircase", "ceiling light", "light switch", "smoke detector"]
SEUIL_COTES, SEUIL_PRESENCE = 0.5, 0.4


def consigne(termes: list[str]) -> str:
    return " ".join(f"a {terme}." for terme in termes)


@dataclass
class Detection:
    element: str
    risque: str
    score: float
    boite_px: tuple[int, int, int, int]
    masque: np.ndarray | None = None


def element_du_libelle(libelle: str) -> tuple[str, str] | None:
    """Traduit le libellé rendu par le détecteur ; le terme le plus long gagne (« door lock » avant « door »)."""
    libelle = libelle.lower()
    return next((ELEMENTS[terme] for terme in _TERMES if terme in libelle), None)


def touche_le_bord(boite_px: tuple[int, int, int, int], largeur: int, hauteur: int, marge_px: int = 8) -> bool:
    """Un élément coupé par le bord de l'image ne peut pas être mesuré en entier."""
    x1, y1, x2, y2 = boite_px
    return x1 <= marge_px or y1 <= marge_px or x2 >= largeur - marge_px or y2 >= hauteur - marge_px


class Detecteur:
    """Charge Grounding DINO et SAM 2.1 aux révisions figées dans modeles.py."""

    def __init__(self, appareil: str):
        import torch
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor, Sam2Model, Sam2Processor

        from modeles import GROUNDING_DINO, SAM

        import time

        self._torch = torch
        self.appareil = appareil
        debut = time.perf_counter()
        self.processeur = AutoProcessor.from_pretrained(GROUNDING_DINO.depot, revision=GROUNDING_DINO.revision)
        self.modele = AutoModelForZeroShotObjectDetection.from_pretrained(
            GROUNDING_DINO.depot, revision=GROUNDING_DINO.revision
        ).to(appareil).eval()
        milieu = time.perf_counter()
        self.processeur_sam = Sam2Processor.from_pretrained(SAM.depot, revision=SAM.revision)
        self.sam = Sam2Model.from_pretrained(SAM.depot, revision=SAM.revision).to(appareil).eval()
        self.durees_chargement_s = {"grounding_dino": milieu - debut, "sam": time.perf_counter() - milieu}

    def detecter(self, image_rvb: np.ndarray, termes: list[str], seuil: float) -> list[Detection]:
        from torchvision.ops import nms

        torch = self._torch
        hauteur, largeur = image_rvb.shape[:2]
        entrees = self.processeur(images=image_rvb, text=consigne(termes), return_tensors="pt").to(self.appareil)
        with torch.no_grad():
            sorties = self.modele(**entrees)
        resultat = self.processeur.post_process_grounded_object_detection(
            sorties, entrees.input_ids, threshold=seuil, text_threshold=0.25, target_sizes=[(hauteur, largeur)]
        )[0]
        boites, scores = resultat["boxes"].float().cpu(), resultat["scores"].float().cpu()
        libelles = resultat.get("text_labels") or resultat["labels"]

        detections: list[Detection] = []
        for i in nms(boites, scores, 0.5).tolist() if len(boites) else []:
            trouve = element_du_libelle(str(libelles[i]))
            x1, y1, x2, y2 = (int(round(v)) for v in boites[i].tolist())
            trop_grande = (x2 - x1) * (y2 - y1) > 0.9 * largeur * hauteur
            if trouve and not trop_grande:
                detections.append(Detection(trouve[0], trouve[1], float(scores[i]), (x1, y1, x2, y2)))
        return detections

    def ajouter_masques(self, image_rvb: np.ndarray, detections: list[Detection]) -> None:
        if not detections:
            return
        torch = self._torch
        boites = [[[float(v) for v in d.boite_px] for d in detections]]
        entrees = self.processeur_sam(images=image_rvb, input_boxes=boites, return_tensors="pt").to(self.appareil)
        with torch.no_grad():
            sorties = self.sam(**entrees, multimask_output=False)
        masques = self.processeur_sam.post_process_masks(sorties.pred_masks.cpu(), entrees["original_sizes"])[0]
        for detection, masque in zip(detections, masques):
            detection.masque = masque.reshape(-1, *masque.shape[-2:])[0].numpy().astype(bool)
