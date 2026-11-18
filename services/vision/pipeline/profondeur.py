"""Points 3D métriques par image avec MoGe-2 (repère caméra OpenCV : x à droite, y vers le bas, z vers l'avant)."""

import numpy as np


class ProfondeurMetrique:
    def __init__(self, appareil: str):
        import torch
        from huggingface_hub import hf_hub_download
        from moge.model.v2 import MoGeModel

        from modeles import MOGE

        import time

        self._torch = torch
        self.appareil = appareil
        debut = time.perf_counter()
        poids = hf_hub_download(MOGE.depot, "model.pt", revision=MOGE.revision)
        self.modele = MoGeModel.from_pretrained(poids).to(appareil).eval()
        self.duree_chargement_s = time.perf_counter() - debut

    def points(self, image_rvb: np.ndarray) -> np.ndarray:
        """Carte (H, W, 3) en mètres ; NaN là où le modèle n'a pas de géométrie fiable (ciel, bords)."""
        torch = self._torch
        image = torch.tensor(image_rvb / 255.0, dtype=torch.float32, device=self.appareil).permute(2, 0, 1)
        sortie = self.modele.infer(image, use_fp16=self.appareil == "cuda")
        points = sortie["points"].float().cpu().numpy()
        points[~np.isfinite(points).all(axis=-1)] = np.nan
        if "mask" in sortie:
            points[~sortie["mask"].cpu().numpy().astype(bool)] = np.nan
        return points
