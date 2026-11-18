"""Calcul des cotes à partir des points 3D métriques d'un élément (repère caméra OpenCV, en mètres)."""

from dataclasses import dataclass

import cv2
import numpy as np

_BAS_CAMERA = np.array([0.0, 1.0, 0.0])
_MAX_POINTS = 50_000


@dataclass(frozen=True)
class Rectangle:
    longueur_m: float
    largeur_m: float
    centre: tuple[float, float, float]
    normale: tuple[float, float, float]


def _plan_robuste(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Ajuste un plan en écartant les points aberrants. Renvoie (origine, base 3×3 [u, v, normale], points gardés)."""
    points = np.asarray(points, float)
    points = points[np.isfinite(points).all(axis=1)]
    if len(points) > _MAX_POINTS:
        points = points[np.random.default_rng(0).choice(len(points), _MAX_POINTS, replace=False)]
    if len(points) < 10:
        raise ValueError("Pas assez de points 3D pour mesurer l'élément.")
    gardes = points
    for _ in range(4):
        origine = np.median(gardes, axis=0)
        base = np.linalg.svd(gardes - origine, full_matrices=False)[2]
        ecarts = (points - origine) @ base[2]
        ecarts -= np.median(ecarts)
        seuil = max(3 * 1.4826 * np.median(np.abs(ecarts)), 0.005)
        gardes = points[np.abs(ecarts) <= seuil]
    return origine, base, gardes


def _rectangle_dans_plan(points: np.ndarray):
    """Plus petit rectangle englobant dans le plan : (cotés en m, directions 3D des cotés, centre 3D, normale)."""
    origine, base, gardes = _plan_robuste(points)
    plan = ((gardes - origine) @ base[:2].T).astype(np.float32)
    coins = cv2.boxPoints(cv2.minAreaRect(plan))
    aretes = [coins[1] - coins[0], coins[2] - coins[1]]
    cotes = [float(np.linalg.norm(a)) for a in aretes]
    directions = [(a / max(c, 1e-9)) @ base[:2] for a, c in zip(aretes, cotes)]
    centre = origine + coins.mean(axis=0) @ base[:2]
    return cotes, directions, centre, base[2]


def rectangle_au_sol(points: np.ndarray) -> Rectangle:
    """Longueur et largeur d'un élément posé à plat (tapis)."""
    cotes, _, centre, normale = _rectangle_dans_plan(points)
    return Rectangle(max(cotes), min(cotes), tuple(float(c) for c in centre), tuple(float(n) for n in normale))


def dimensions_frontales(points: np.ndarray) -> tuple[float, float]:
    """(largeur, hauteur) en mètres d'un élément vertical (porte, fenêtre) : la hauteur suit le bas de l'image."""
    cotes, directions, _, _ = _rectangle_dans_plan(points)
    vertical = int(np.argmax([abs(d @ _BAS_CAMERA) for d in directions]))
    return cotes[1 - vertical], cotes[vertical]


def _plan_ransac(points: np.ndarray, seuil_m: float = 0.02, essais: int = 300) -> tuple[np.ndarray, np.ndarray]:
    """Plan dominant d'un nuage qui contient autre chose que ce plan (mur avec meubles). Renvoie (origine, normale)."""
    points = np.asarray(points, float)
    points = points[np.isfinite(points).all(axis=1)]
    hasard = np.random.default_rng(0)
    if len(points) > 20_000:
        points = points[hasard.choice(len(points), 20_000, replace=False)]
    if len(points) < 50:
        raise ValueError("Pas assez de points pour trouver le plan du mur.")
    meilleurs = None
    for _ in range(essais):
        a, b, c = points[hasard.choice(len(points), 3, replace=False)]
        normale = np.cross(b - a, c - a)
        norme = np.linalg.norm(normale)
        if norme < 1e-9:
            continue
        proches = np.abs((points - a) @ (normale / norme)) < seuil_m
        if meilleurs is None or proches.sum() > meilleurs.sum():
            meilleurs = proches
    gardes = points[meilleurs]
    origine = gardes.mean(axis=0)
    return origine, np.linalg.svd(gardes - origine, full_matrices=False)[2][2]


def dimensions_sur_le_mur(points_element: np.ndarray, points_mur: np.ndarray) -> tuple[float, float]:
    """(largeur, hauteur) d'une ouverture dans un mur (fenêtre).

    À travers une vitre, les points 3D sont dehors, loin derrière le mur. On ne garde donc que la direction
    de chaque point vu depuis la caméra, et on la prolonge jusqu'au plan du mur trouvé autour de l'ouverture.
    """
    origine, normale = _plan_ransac(points_mur)
    points = np.asarray(points_element, float)
    points = points[np.isfinite(points).all(axis=1)]
    if len(points) > _MAX_POINTS:
        points = points[np.random.default_rng(0).choice(len(points), _MAX_POINTS, replace=False)]
    rayons = points / np.linalg.norm(points, axis=1, keepdims=True)
    incidence = rayons @ normale
    valides = np.abs(incidence) > 0.05
    distance = (origine @ normale) / incidence[valides]
    sur_le_mur = rayons[valides][distance > 0] * distance[distance > 0, None]
    if len(sur_le_mur) < 10:
        raise ValueError("Pas assez de points pour mesurer l'ouverture.")
    u = np.cross(normale, _BAS_CAMERA)
    u /= np.linalg.norm(u)
    v = np.cross(normale, u)
    plan = np.column_stack([(sur_le_mur - origine) @ u, (sur_le_mur - origine) @ v]).astype(np.float32)
    coins = cv2.boxPoints(cv2.minAreaRect(plan))
    aretes = [coins[1] - coins[0], coins[2] - coins[1]]
    cotes = [float(np.linalg.norm(a)) for a in aretes]
    directions = [a[0] * u + a[1] * v for a in aretes]
    vertical = int(np.argmax([abs(d @ _BAS_CAMERA) for d in directions]))
    return cotes[1 - vertical], cotes[vertical]


def agreger_cotes(valeurs_cm: list[float]) -> tuple[float, float | None]:
    """Cote retenue entre plusieurs vues : médiane, et marge = dispersion robuste (None avec une seule vue)."""
    if len(valeurs_cm) == 1:
        return float(valeurs_cm[0]), None
    mediane = float(np.median(valeurs_cm))
    marge = 1.4826 * float(np.median(np.abs(np.asarray(valeurs_cm) - mediane)))
    return mediane, round(marge, 1)
