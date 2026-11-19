"""Reconstruction 3D métrique multi-vues avec MapAnything (variante Apache) : toutes les vues dans un même repère."""

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass
class Reconstruction:
    points: np.ndarray  # (vues, H, W, 3), en mètres dans le repère commun (celui de la première caméra) ; NaN si invalide
    couleurs: np.ndarray  # (vues, H, W, 3), RVB sur 8 bits
    poses: np.ndarray  # (vues, 4, 4), caméra → repère commun


def _un_point_par_voxel(nuage: np.ndarray, teintes: np.ndarray, voxel_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Garde un point par cube de `voxel_m` : les vues qui se recouvrent n'empilent plus leurs couches."""
    cases = np.floor(nuage / voxel_m).astype(np.int64)
    cles = cases[:, 0] * 73856093 ^ cases[:, 1] * 19349663 ^ cases[:, 2] * 83492791
    _, premiers = np.unique(cles, return_index=True)
    premiers.sort()
    return nuage[premiers], teintes[premiers]


def _sans_points_isoles(nuage: np.ndarray, teintes: np.ndarray, voisins: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Écarte les points loin de leurs voisins (bords de masque, reflets) : distance moyenne > médiane + 3 écarts (au moins 2,5 fois la médiane)."""
    if len(nuage) <= voisins + 1:
        return nuage, teintes
    from scipy.spatial import cKDTree

    distances, _ = cKDTree(nuage).query(nuage, k=voisins + 1)
    moyennes = distances[:, 1:].mean(axis=1)
    mediane = np.median(moyennes)
    ecart = np.median(np.abs(moyennes - mediane)) * 1.4826
    # Plancher sur l'écart : sur une surface très régulière il est presque nul, et les bords seraient retirés à tort.
    gardes = moyennes <= mediane + 3 * max(ecart, 0.5 * mediane)
    return nuage[gardes], teintes[gardes]


def nuage_fusionne(
    points: np.ndarray, couleurs: np.ndarray, max_points: int = 400_000,
    voxel_m: float | None = None, nettoyer: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Rassemble les points valides de toutes les vues, en tirant au sort au-delà de `max_points`.

    Pour le modèle montré à l'utilisateur : `voxel_m` garde un point par cube (densité régulière, sans
    couches empilées d'une vue à l'autre) et `nettoyer` écarte les points isolés. Les deux s'appliquent
    avant le tirage au sort, pour que le plafond ne retire que des points utiles en trop.
    """
    valides = np.isfinite(points).all(axis=-1)
    nuage, teintes = points[valides], couleurs[valides]
    if voxel_m and len(nuage):
        nuage, teintes = _un_point_par_voxel(nuage, teintes, voxel_m)
    if len(nuage) > max_points:
        choix = np.random.default_rng(0).choice(len(nuage), max_points, replace=False)
        nuage, teintes = nuage[choix], teintes[choix]
    if nettoyer:
        nuage, teintes = _sans_points_isoles(nuage, teintes)
    return nuage, teintes


def centre_dans_la_vue(points_vue: np.ndarray, masque: np.ndarray) -> tuple[float, float, float] | None:
    """Position médiane d'un élément dans le repère commun, d'après son masque (pris à la résolution de l'image)."""
    hauteur, largeur = points_vue.shape[:2]
    reduit = cv2.resize(masque.astype(np.uint8), (largeur, hauteur), interpolation=cv2.INTER_NEAREST).astype(bool)
    nuage = points_vue[reduit]
    nuage = nuage[np.isfinite(nuage).all(axis=1)]
    return tuple(float(v) for v in np.median(nuage, axis=0)) if len(nuage) else None


def hub_fige(charger_d_origine, dossier_dinov2: str):
    """Remplace torch.hub.load : le code de DINOv2 vient du dossier figé, jamais de la branche main de GitHub."""

    def charger(depot, modele, *args, **options):
        if str(depot).split(":")[0] == "facebookresearch/dinov2":
            options = {k: v for k, v in options.items() if k not in ("force_reload", "source")}
            return charger_d_origine(dossier_dinov2, modele, *args, source="local", **options)
        return charger_d_origine(depot, modele, *args, **options)

    return charger


def code_dinov2() -> Path:
    """Dossier du code DINOv2 au commit figé dans modeles.py. Téléchargé une seule fois, puis lu sans réseau."""
    import io
    import shutil
    import tempfile
    import urllib.request
    import zipfile

    import torch

    from modeles import CODE_DINOV2

    dossier = Path(torch.hub.get_dir()) / f"facebookresearch_dinov2_{CODE_DINOV2.revision}"
    if not (dossier / "hubconf.py").exists():
        with urllib.request.urlopen(CODE_DINOV2.archive, timeout=120) as reponse:
            archive = zipfile.ZipFile(io.BytesIO(reponse.read()))
        with tempfile.TemporaryDirectory() as provisoire:
            archive.extractall(provisoire)
            dossier.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(next(Path(provisoire).iterdir())), str(dossier))
    return dossier


class Reconstructeur:
    """Charge MapAnything à la révision figée dans modeles.py (fiche sous licence Apache 2.0 à cette révision)."""

    def __init__(self, appareil: str):
        import torch
        from mapanything.models import MapAnything

        from modeles import MAPANYTHING

        import time

        self._torch = torch
        self.appareil = appareil
        debut = time.perf_counter()
        charger_d_origine = torch.hub.load
        torch.hub.load = hub_fige(charger_d_origine, str(code_dinov2()))
        try:
            modele = MapAnything.from_pretrained(MAPANYTHING.depot, revision=MAPANYTHING.revision)
        finally:
            torch.hub.load = charger_d_origine
        self.modele = modele.to(appareil).eval()
        self.duree_chargement_s = time.perf_counter() - debut

    def reconstruire(self, images: list[Path]) -> Reconstruction:
        from mapanything.utils.image import load_images

        vues = load_images([str(chemin) for chemin in images])
        sur_cuda = self.appareil == "cuda"
        with self._torch.no_grad():
            sorties = self.modele.infer(
                vues, memory_efficient_inference=True, minibatch_size=None if sur_cuda else 1,
                use_amp=sur_cuda, apply_mask=True, mask_edges=True,
            )
        points, couleurs, poses = [], [], []
        for sortie in sorties:
            nuage = sortie["pts3d"][0].float().cpu().numpy()
            nuage[~sortie["mask"][0, ..., 0].cpu().numpy().astype(bool)] = np.nan
            image = sortie["img_no_norm"][0].float().cpu().numpy()
            points.append(nuage)
            couleurs.append((image * 255 if image.max() <= 1.0 else image).clip(0, 255).astype(np.uint8))
            poses.append(sortie["camera_poses"][0].float().cpu().numpy())
        return Reconstruction(np.stack(points), np.stack(couleurs), np.stack(poses))
