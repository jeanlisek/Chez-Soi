"""Garde-fous du plan B et du dépôt public."""

import json
import subprocess
from pathlib import Path

import pytest

from pipeline.export import Faille

RACINE = Path(__file__).parents[1]
PLAN_B = RACINE / "precalcule" / "demo" / "failles.json"
INTERDITS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".glb", ".gltf", ".ply", ".mp4", ".mov", ".npz")


def test_le_plan_b_respecte_le_format_des_failles():
    failles = [Faille(**f) for f in json.loads(PLAN_B.read_text(encoding="utf-8"))["failles"]]

    assert failles
    for faille in failles:
        cote = faille.position_3d["cote"]
        if cote["statut"] == "estimee":
            assert faille.cote_estimee_cm is not None and faille.origine == "pipeline"
        else:
            # Une cote à confirmer n'est jamais écrite comme une cote estimée.
            cotes = (faille.cote_estimee_cm, faille.marge_cm, faille.largeur_cm, faille.longueur_cm, faille.hauteur_cm)
            assert cotes == (None,) * 5 and faille.origine is None


def test_aucune_image_ni_modele_3d_ni_video_n_est_suivi_par_git():
    suivi = subprocess.run(["git", "ls-files", "services/vision"], cwd=RACINE.parents[1], capture_output=True, text=True)
    if suivi.returncode != 0:
        pytest.skip("Hors d'un dépôt git (image Docker).")

    assert [f for f in suivi.stdout.splitlines() if f.lower().endswith(INTERDITS)] == []
