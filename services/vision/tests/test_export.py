import json

import numpy as np
import pytest
import trimesh
from pydantic import ValidationError

from pipeline.export import Faille, annoter_image, ecrire_failles, exporter_glb, libelle_cote


def _tapis(**champs) -> Faille:
    base = dict(
        element="tapis", piece="sejour", risque="chute", cote_estimee_cm=158.4, marge_cm=3.1,
        largeur_cm=61.2, longueur_cm=158.4, position_3d={"centre": [0.2, 0.9, 2.5]},
    )
    return Faille(**{**base, **champs})


def test_une_faille_du_pipeline_a_pour_source_vision_et_origine_pipeline():
    faille = _tapis(origine="pipeline")
    assert (faille.source, faille.origine) == ("vision", "pipeline")
    assert _tapis().origine is None


def test_une_origine_inconnue_est_refusee():
    with pytest.raises(ValidationError):
        _tapis(origine="invente")


def test_ecrire_failles_produit_un_json_aux_colonnes_de_la_table_failles(tmp_path):
    chemin = ecrire_failles([_tapis()], tmp_path / "failles.json", logement_id="demo", modele_3d="modele.glb")

    contenu = json.loads(chemin.read_text(encoding="utf-8"))
    assert contenu["logement_id"] == "demo" and contenu["modele_3d"] == "modele.glb"
    assert set(contenu["failles"][0]) == {
        "element", "piece", "risque", "source", "origine", "cote_estimee_cm", "marge_cm",
        "largeur_cm", "longueur_cm", "hauteur_cm", "position_3d",
    }
    assert contenu["failles"][0]["hauteur_cm"] is None


def test_libelle_cote_arrondit_au_centimetre_largeur_d_abord():
    assert libelle_cote("tapis", largeur_cm=61.2, longueur_cm=158.4) == "tapis 61 × 158 cm"
    assert libelle_cote("porte", largeur_cm=82.6, hauteur_cm=204.3) == "porte 83 × 204 cm"
    assert libelle_cote("serrure") == "serrure"


def test_annoter_image_dessine_sur_une_copie(tmp_path):
    image = np.full((400, 600, 3), 90, np.uint8)
    masque = np.zeros((400, 600), bool)
    masque[200:330, 120:480] = True

    annotee = annoter_image(image, [{"libelle": "tapis 61 × 158 cm", "boite_px": [120, 200, 480, 330], "masque": masque}])

    assert annotee.shape == image.shape
    assert (image == 90).all()
    assert (annotee != image).any()


def test_exporter_glb_ecrit_un_nuage_de_points_relisible(tmp_path):
    points = np.random.default_rng(0).uniform(-1, 1, (500, 3))
    couleurs = np.full((500, 3), 128, np.uint8)

    chemin = exporter_glb(points, couleurs, tmp_path / "modele.glb")

    scene = trimesh.load(chemin)
    assert sum(len(g.vertices) for g in scene.geometry.values()) == 500


def test_le_libelle_d_un_element_coupe_annonce_sa_partie_visible():
    from pipeline.export import libelle_partiel

    assert libelle_partiel("tapis", {"largeur_cm": 95.2, "longueur_cm": 140.4}) == "tapis · cote à confirmer (visible : 95 × 140 cm)"


def test_annoter_image_agrandit_une_petite_image_pour_rester_lisible():
    image = np.full((848, 480, 3), 90, np.uint8)

    annotee = annoter_image(image, [{"libelle": "porte 73 × 198 cm", "boite_px": [100, 100, 300, 700], "masque": None}], largeur_min=960)

    assert annotee.shape == (1696, 960, 3)


def test_deux_libelles_au_meme_endroit_ne_se_recouvrent_pas():
    from pipeline.export import placer_libelle

    occupes: list[tuple[int, int, int, int]] = []
    premier = placer_libelle(10, 40, largeur=200, hauteur=30, occupes=occupes, hauteur_image=800)
    second = placer_libelle(60, 45, largeur=200, hauteur=30, occupes=occupes, hauteur_image=800)

    assert premier == (10, 40)
    assert second[1] >= premier[1] + 30


def test_les_libelles_affichent_le_nom_de_l_element_avec_ses_accents():
    assert libelle_cote("fenetre", largeur_cm=150.0, hauteur_cm=166.0) == "fenêtre 150 × 166 cm"
    assert libelle_cote("detecteur_fumee") == "détecteur de fumée"
