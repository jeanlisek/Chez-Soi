import pytest

from pipeline.analyse import MesureVue, construire_failles


def _vue(image: str, element: str = "tapis", risque: str = "chute", **cotes) -> MesureVue:
    return MesureVue(element=element, risque=risque, image=image, score=0.6, boite_px=(10, 20, 300, 200),
                     centre=(0.1, 0.9, 2.4), **cotes)


def test_les_vues_d_un_meme_element_donnent_une_faille_a_la_cote_mediane():
    vues = [
        _vue("image_001.jpg", largeur_cm=60.0, longueur_cm=158.0),
        _vue("image_002.jpg", largeur_cm=61.0, longueur_cm=160.0),
        _vue("image_003.jpg", largeur_cm=62.0, longueur_cm=162.0),
    ]

    (faille,) = construire_failles(vues, piece="sejour")

    assert (faille.element, faille.piece, faille.risque) == ("tapis", "sejour", "chute")
    assert (faille.largeur_cm, faille.longueur_cm, faille.hauteur_cm) == (61.0, 160.0, None)
    assert faille.cote_estimee_cm == 160.0
    assert faille.marge_cm == pytest.approx(3.0, abs=0.1)
    assert faille.position_3d["image_cle"] == "image_002.jpg"
    assert faille.position_3d["nb_vues"] == 3


def test_la_cote_principale_d_une_porte_est_sa_largeur_de_passage():
    (faille,) = construire_failles([_vue("image_004.jpg", element="porte", risque="autre", largeur_cm=83.0, hauteur_cm=204.0)], piece=None)

    assert faille.cote_estimee_cm == 83.0
    assert faille.marge_cm is None


def test_un_element_sans_cote_donne_une_faille_de_presence():
    (faille,) = construire_failles([_vue("image_005.jpg", element="serrure", risque="intrusion")], piece=None)

    assert faille.cote_estimee_cm is None
    assert faille.position_3d["image_cle"] == "image_005.jpg"


def test_la_feuille_a4_sert_de_reference_d_echelle_et_n_est_pas_une_faille():
    from pipeline.analyse import facteur_echelle_a4

    vues = [
        _vue("image_001.jpg", element="feuille_a4", risque="autre", largeur_cm=20.0, longueur_cm=28.3),
        _vue("image_001.jpg", largeur_cm=57.0, longueur_cm=152.0),
    ]

    assert facteur_echelle_a4(vues) == pytest.approx(1.05, abs=0.005)
    assert [f.element for f in construire_failles(vues, piece=None)] == ["tapis"]


def test_une_feuille_aux_proportions_invraisemblables_ne_calibre_rien():
    from pipeline.analyse import facteur_echelle_a4

    assert facteur_echelle_a4([_vue("image_001.jpg", element="feuille_a4", risque="autre", largeur_cm=20.0, longueur_cm=50.0)]) is None


def test_deux_instances_du_meme_element_donnent_deux_failles():
    vues = [
        _vue("image_001.jpg", element="porte", risque="autre", largeur_cm=83.0, hauteur_cm=204.0),
        _vue("image_002.jpg", element="porte", risque="autre", largeur_cm=73.0, hauteur_cm=204.0),
    ]
    vues[1].instance = 1

    failles = construire_failles(vues, piece=None)

    assert sorted(f.largeur_cm for f in failles) == [73.0, 83.0]


def test_une_vue_coupee_par_le_cadre_ne_compte_pas_dans_la_cote():
    entiere = _vue("image_001.jpg", largeur_cm=60.0, longueur_cm=160.0)
    coupee = _vue("image_002.jpg", largeur_cm=60.0, longueur_cm=110.0)
    coupee.coupe = True

    (faille,) = construire_failles([entiere, coupee], piece=None)

    assert faille.longueur_cm == 160.0
    assert faille.position_3d["cote"] == {"statut": "estimee"}


def test_un_element_toujours_coupe_n_a_pas_de_cote_mais_garde_sa_partie_visible():
    coupee = _vue("image_002.jpg", largeur_cm=95.0, longueur_cm=140.0)
    coupee.coupe = True

    (faille,) = construire_failles([coupee], piece=None)

    assert (faille.cote_estimee_cm, faille.largeur_cm, faille.longueur_cm) == (None, None, None)
    assert faille.position_3d["cote"]["partie_visible_cm"] == {"largeur_cm": 95.0, "longueur_cm": 140.0}


def test_une_mesure_invraisemblable_est_ecartee():
    from pipeline.analyse import plausible

    assert plausible(_vue("a.jpg", element="porte", risque="autre", largeur_cm=73.0, hauteur_cm=198.0))
    assert not plausible(_vue("a.jpg", element="porte", risque="autre", largeur_cm=34.0, hauteur_cm=204.0))
    assert not plausible(_vue("a.jpg", largeur_cm=18.0, longueur_cm=22.0))
    assert plausible(_vue("a.jpg", element="serrure", risque="intrusion"))


def test_suivre_instances_reunit_les_vues_qui_se_suivent_dans_la_video():
    from pipeline.analyse import suivre_instances

    # (numéro de l'image dans la vidéo, élément) : la porte est vue aux images 28 à 31, une autre aux images 38 et 39.
    vues = [(28, "porte"), (28, "tapis"), (29, "porte"), (30, "porte"), (31, "porte"), (38, "porte"), (39, "porte")]

    assert suivre_instances(vues, ecart_max=3) == [0, 0, 0, 0, 0, 1, 1]


def test_suivre_instances_separe_deux_objets_du_meme_type_dans_la_meme_image():
    from pipeline.analyse import suivre_instances

    assert suivre_instances([(4, "porte"), (4, "porte"), (5, "porte")], ecart_max=3) == [0, 1, 0]


def test_une_vue_entiere_plus_petite_que_la_partie_visible_ailleurs_est_un_objet_masque():
    # Fenêtre vue de loin, à moitié cachée par un mur : la boîte ne touche pas le bord, mais la mesure est fausse.
    masquee = _vue("image_005.jpg", element="fenetre", risque="intrusion", largeur_cm=71.0, hauteur_cm=84.0)
    coupee = _vue("image_009.jpg", element="fenetre", risque="intrusion", largeur_cm=134.0, hauteur_cm=160.0)
    coupee.coupe = True

    (faille,) = construire_failles([masquee, coupee], piece=None)

    assert faille.cote_estimee_cm is None
    assert faille.position_3d["cote"]["partie_visible_cm"] == {"largeur_cm": 134.0, "hauteur_cm": 160.0}


def test_une_partie_visible_minuscule_est_ecartee():
    from pipeline.analyse import plausible

    miette = _vue("a.jpg", largeur_cm=13.0, longueur_cm=19.0)
    miette.coupe = True
    morceau = _vue("a.jpg", largeur_cm=80.0, longueur_cm=154.0)
    morceau.coupe = True

    assert not plausible(miette)
    assert plausible(morceau)


def test_les_segments_d_une_meme_piece_sont_reunis_dans_l_ordre_de_la_video():
    from pipeline.analyse import Piece, regrouper_pieces

    pieces = [Piece("Entrée", 0.0, 2.2), Piece("Chambre", 21.0, 27.6), Piece("entrée", 27.8, 31.5)]

    assert regrouper_pieces(pieces) == {"Entrée": [(0.0, 2.2), (27.8, 31.5)], "Chambre": [(21.0, 27.6)]}


def test_le_dossier_d_une_piece_n_a_ni_accent_ni_espace():
    from pipeline.analyse import dossier_piece

    assert dossier_piece("Séjour / salle à manger") == "sejour_salle_a_manger"


def test_une_cote_mesuree_est_marquee_estimee_avec_l_origine_pipeline():
    (faille,) = construire_failles([_vue("image_001.jpg", largeur_cm=60.0, longueur_cm=160.0)], piece=None)

    assert faille.origine == "pipeline"
    assert faille.position_3d["cote"] == {"statut": "estimee"}


def test_un_element_hors_cadre_est_marque_a_confirmer_sans_cote_ni_origine():
    coupee = _vue("image_002.jpg", largeur_cm=79.9, longueur_cm=154.4)
    coupee.coupe = True

    (faille,) = construire_failles([coupee], piece=None)

    assert (faille.cote_estimee_cm, faille.marge_cm, faille.largeur_cm, faille.longueur_cm, faille.origine) == (None,) * 5
    assert faille.position_3d["cote"] == {
        "statut": "a_confirmer",
        "raison": "hors_cadre",
        "partie_visible_cm": {"largeur_cm": 79.9, "longueur_cm": 154.4},
        "message": "Cote à confirmer par l'utilisateur : l'objet est coupé par le cadre dans toutes les vues.",
    }


def test_un_element_de_presence_n_a_pas_de_cote_a_confirmer():
    (faille,) = construire_failles([_vue("image_005.jpg", element="serrure", risque="intrusion")], piece=None)

    assert faille.origine is None
    assert faille.position_3d["cote"] == {"statut": "sans_objet"}


def test_la_vue_de_reference_montre_le_tapis_et_une_cote_en_grand():
    from pipeline.analyse import choisir_vue_de_reference

    # Par vue : (élément, cote estimée ?, aire de la boîte en pixels)
    vues = {
        "miroir.jpg": [("fenetre", True, 20_000), ("tapis", False, 4_000)],
        "chambre.jpg": [("porte", True, 60_000), ("tapis", False, 110_000)],
        "porte_seule.jpg": [("porte", True, 90_000)],
    }

    assert choisir_vue_de_reference(vues) == "chambre.jpg"
