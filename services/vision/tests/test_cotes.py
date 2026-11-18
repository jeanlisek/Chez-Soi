import numpy as np
import pytest

from pipeline.cotes import agreger_cotes, dimensions_frontales, rectangle_au_sol


def _rectangle_3d(longueur: float, largeur: float, rotation: np.ndarray, centre, n: int = 4000, bruit: float = 0.002):
    rng = np.random.default_rng(0)
    plan = np.column_stack([
        rng.uniform(-longueur / 2, longueur / 2, n),
        rng.uniform(-largeur / 2, largeur / 2, n),
        rng.normal(0, bruit, n),
    ])
    return plan @ rotation.T + np.asarray(centre)


def _rotation(axe, angle_deg: float) -> np.ndarray:
    axe = np.asarray(axe, float) / np.linalg.norm(axe)
    a = np.deg2rad(angle_deg)
    k = np.array([[0, -axe[2], axe[1]], [axe[2], 0, -axe[0]], [-axe[1], axe[0], 0]])
    return np.eye(3) + np.sin(a) * k + (1 - np.cos(a)) * k @ k


def test_rectangle_au_sol_retrouve_longueur_et_largeur_d_un_tapis_incline():
    rotation = _rotation([1, 0, 0], 65) @ _rotation([0, 0, 1], 30)
    points = _rectangle_3d(1.60, 0.60, rotation, centre=[0.2, 0.9, 2.5])

    rectangle = rectangle_au_sol(points)

    assert rectangle.longueur_m == pytest.approx(1.60, abs=0.02)
    assert rectangle.largeur_m == pytest.approx(0.60, abs=0.02)
    assert rectangle.centre == pytest.approx([0.2, 0.9, 2.5], abs=0.03)


def test_rectangle_au_sol_ignore_les_points_aberrants_hors_du_plan():
    rotation = _rotation([1, 0, 0], 70)
    points = _rectangle_3d(1.60, 0.60, rotation, centre=[0, 1.0, 2.0])
    rng = np.random.default_rng(1)
    aberrants = points[:80] + rotation @ np.array([0, 0, 1.0]) * rng.uniform(0.3, 1.5, (80, 1)) + rng.uniform(-1, 1, (80, 3))

    rectangle = rectangle_au_sol(np.vstack([points, aberrants]))

    assert rectangle.longueur_m == pytest.approx(1.60, abs=0.03)
    assert rectangle.largeur_m == pytest.approx(0.60, abs=0.03)


def test_dimensions_frontales_donne_largeur_et_hauteur_d_une_porte():
    # Repère caméra OpenCV : x à droite, y vers le bas, z vers l'avant. Porte verticale, vue de biais.
    rotation = _rotation([0, 1, 0], 25) @ _rotation([0, 0, 1], 90)
    points = _rectangle_3d(2.04, 0.83, rotation, centre=[0.1, -0.2, 3.0])

    largeur_m, hauteur_m = dimensions_frontales(points)

    assert largeur_m == pytest.approx(0.83, abs=0.02)
    assert hauteur_m == pytest.approx(2.04, abs=0.02)


def test_agreger_cotes_prend_la_mediane_et_une_marge_insensible_a_une_valeur_aberrante():
    cote, marge = agreger_cotes([158.0, 160.0, 162.0, 161.0, 300.0])

    assert cote == 161.0
    assert 1.0 <= marge <= 5.0


def test_agreger_cotes_sans_marge_quand_il_n_y_a_qu_une_vue():
    assert agreger_cotes([157.3]) == (157.3, None)


def test_dimensions_sur_le_mur_mesure_une_fenetre_dont_on_voit_le_dehors():
    # Mur vertical vu de biais ; à travers la vitre, les points 3D sont loin derrière le mur.
    from pipeline.cotes import dimensions_sur_le_mur

    rotation = _rotation([0, 1, 0], 20) @ _rotation([0, 0, 1], 90)
    centre = [0.2, -0.3, 3.0]
    vitre = _rectangle_3d(1.66, 1.50, rotation, centre, bruit=0.0)
    rng = np.random.default_rng(2)
    dehors = vitre * rng.uniform(2.0, 15.0, (len(vitre), 1))  # même rayon depuis la caméra, mais bien plus loin
    mur = _rectangle_3d(2.4, 2.4, rotation, centre, n=6000)
    hors_fenetre = np.abs((mur - np.asarray(centre)) @ rotation)[:, :2] > [0.86, 0.78]
    mur = mur[hors_fenetre.any(axis=1)]

    largeur_m, hauteur_m = dimensions_sur_le_mur(dehors, mur)

    assert largeur_m == pytest.approx(1.50, abs=0.03)
    assert hauteur_m == pytest.approx(1.66, abs=0.03)
