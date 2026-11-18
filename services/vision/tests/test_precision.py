import pytest

from pipeline.precision import comparer, tableau_markdown

FAILLES = [{"element": "tapis", "largeur_cm": 61.0, "longueur_cm": 158.0, "hauteur_cm": None}]


def test_comparer_donne_l_ecart_en_cm_et_en_pourcentage():
    (ecart,) = comparer(FAILLES, [{"element": "tapis", "dimension": "longueur_cm", "reel_cm": 160.0}])

    assert (ecart.mesure_cm, ecart.reel_cm) == (158.0, 160.0)
    assert ecart.ecart_cm == pytest.approx(-2.0)
    assert ecart.ecart_pct == pytest.approx(-1.25)


def test_un_objet_que_le_pipeline_n_a_pas_mesure_reste_sans_ecart():
    (ecart,) = comparer(FAILLES, [{"element": "porte", "dimension": "largeur_cm", "reel_cm": 83.0}])

    assert (ecart.mesure_cm, ecart.ecart_cm, ecart.ecart_pct) == (None, None, None)


def test_tableau_markdown_a_une_ligne_par_mesure():
    ecarts = comparer(FAILLES, [
        {"element": "tapis", "dimension": "longueur_cm", "reel_cm": 160.0},
        {"element": "porte", "dimension": "largeur_cm", "reel_cm": 83.0},
    ])

    lignes = tableau_markdown(ecarts).splitlines()

    assert lignes[2] == "| tapis | longueur | 158,0 | 160,0 | -2,0 | -1,2 % |"
    assert lignes[3] == "| porte | largeur | non mesuré | 83,0 | | |"


def test_comparer_choisit_l_objet_par_son_numero_quand_il_y_en_a_plusieurs():
    failles = [
        {"element": "porte", "largeur_cm": 72.7, "hauteur_cm": 183.7, "position_3d": {"instance": 2}},
        {"element": "porte", "largeur_cm": 77.0, "hauteur_cm": 206.0, "position_3d": {"instance": 3}},
    ]

    (ecart,) = comparer(failles, [{"element": "porte", "instance": 2, "dimension": "largeur_cm", "reel_cm": 71.5}])

    assert ecart.mesure_cm == 72.7


def test_comparer_choisit_l_objet_par_sa_piece():
    failles = [
        {"element": "porte", "piece": "chambre", "largeur_cm": 72.9, "position_3d": {"instance": 0}},
        {"element": "porte", "piece": "couloir", "largeur_cm": 75.8, "position_3d": {"instance": 0}},
    ]

    (ecart,) = comparer(failles, [{"element": "porte", "piece": "couloir", "dimension": "largeur_cm", "reel_cm": 77.0}])

    assert ecart.mesure_cm == 75.8
