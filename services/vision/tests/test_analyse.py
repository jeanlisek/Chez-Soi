import pytest

from pipeline.analyse import MesureVue, construire_failles, ecarter_vues_uniques, fusionner_instances_proches


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


def _vue_3d(image, instance, centre, element="tapis"):
    return MesureVue(element=element, risque="chute", image=image, score=0.6, boite_px=(0, 0, 10, 10), centre=None,
                     instance=instance, centre_monde=centre)


def test_un_objet_revu_plus_tard_au_meme_endroit_reste_le_meme_objet():
    mesures = [
        _vue_3d("image_001.jpg", 0, (1.0, 0.0, 2.0)),
        _vue_3d("image_002.jpg", 0, (1.02, 0.0, 2.01)),
        _vue_3d("image_020.jpg", 1, (1.1, 0.0, 2.1)),   # même tapis, revu en fin de vidéo
        _vue_3d("image_021.jpg", 2, (3.5, 0.0, 0.5)),   # autre tapis, ailleurs dans la pièce
    ]

    fusionner_instances_proches(mesures)

    assert [m.instance for m in mesures] == [0, 0, 0, 2]


def test_sans_position_3d_les_instances_ne_bougent_pas():
    mesures = [_vue_3d("image_001.jpg", 0, None), _vue_3d("image_020.jpg", 1, None)]

    fusionner_instances_proches(mesures)

    assert [m.instance for m in mesures] == [0, 1]


def test_un_element_mesurable_vu_une_seule_fois_et_coupe_par_le_cadre_est_ecarte():
    coupe = _vue_3d("image_009.jpg", 1, None)
    coupe.coupe = True
    fenetre = _vue_3d("image_016.jpg", 0, None, element="fenetre")  # vue une seule fois, mais en entier
    mesures = [
        _vue_3d("image_001.jpg", 0, None), _vue_3d("image_002.jpg", 0, None),
        coupe,                                                  # tapis vu une seule fois, coupé par le cadre
        _vue_3d("image_009.jpg", 0, None, element="serrure"),   # petit élément : une vue suffit
        fenetre,
    ]

    gardees = [(m.element, m.instance) for m in ecarter_vues_uniques(mesures, nb_images=30)]
    assert gardees == [("tapis", 0), ("tapis", 0), ("serrure", 0), ("fenetre", 0)]
    assert len(ecarter_vues_uniques(mesures, nb_images=3)) == 5  # quelques photos : on garde tout


def test_la_planche_montre_une_vignette_par_point_sur_son_image_cle(tmp_path):
    import cv2
    import numpy as np
    from types import SimpleNamespace

    from pipeline.analyse import LARGEUR_VIGNETTE, planche_par_point

    def vue(nom, element, instance):
        chemin = tmp_path / nom
        cv2.imwrite(str(chemin), np.full((192, 108, 3), 200, np.uint8))
        return {
            "chemin": chemin,
            "detections": [SimpleNamespace(boite_px=(10, 20, 60, 90), masque=None)],
            "mesures": [SimpleNamespace(element=element, instance=instance)],
        }

    vues = {"image_000.jpg": vue("image_000.jpg", "tapis", 0), "image_016.jpg": vue("image_016.jpg", "fenetre", 0)}
    failles = [
        SimpleNamespace(element="tapis", position_3d={"image_cle": "image_000.jpg", "instance": 0}),
        SimpleNamespace(element="fenetre", position_3d={"image_cle": "image_016.jpg", "instance": 0}),
        SimpleNamespace(element="porte", position_3d={"image_cle": "image_099.jpg", "instance": 0}),  # image absente
    ]

    planche = planche_par_point(failles, vues, lambda f: f.element)

    hauteur = round(1920 * LARGEUR_VIGNETTE / 1080)
    assert planche.shape == (2 * hauteur, LARGEUR_VIGNETTE, 3)
    assert failles[0].position_3d["vignette"] == {
        "index": 0, "total": 2, "largeur": LARGEUR_VIGNETTE, "hauteur": hauteur, "boite": [0.0926, 0.1042, 0.5556, 0.4688],
    }
    assert failles[1].position_3d["vignette"]["index"] == 1
    assert "vignette" not in failles[2].position_3d
    assert planche_par_point([], vues, lambda f: f.element) is None


def _carte_de_points(h=40, w=30, z=2.0):
    import numpy as np

    ys, xs = np.mgrid[0:h, 0:w]
    return np.stack([(xs - w / 2) * 0.01, -(ys - h / 2) * 0.01, np.full((h, w), -z)], -1).astype(float)


def test_la_photo_en_relief_coupe_les_ruptures_de_profondeur_et_les_points_invalides():
    import numpy as np

    from pipeline.export import relief_texture

    points = _carte_de_points()
    image = np.full((400, 300, 3), 180, np.uint8)
    plein = relief_texture(points, image)
    assert len(plein.faces) == 2 * 39 * 29 and plein.visual.uv.shape == (40 * 30, 2)

    points[:, 15:, 2] = -4.0          # un mur deux mètres derrière : pas de voile entre les deux plans
    points[0, 0] = np.nan             # point sans profondeur
    coupe = relief_texture(points, image)
    assert len(coupe.faces) == 2 * 39 * 29 - 2 * 39 - 1
    assert relief_texture(np.full((40, 30, 3), np.nan), image) is None
    assert len(relief_texture(_carte_de_points(400, 300), image, sommets_max=5_000).vertices) <= 5_000


def test_le_glb_porte_le_nuage_et_un_noeud_par_vue_cle(tmp_path):
    import numpy as np
    import trimesh

    from pipeline.export import exporter_glb, relief_texture

    relief = relief_texture(_carte_de_points(), np.full((400, 300, 3), 180, np.uint8))
    chemin = exporter_glb(np.zeros((5, 3)), np.zeros((5, 3), np.uint8), tmp_path / "modele.glb", {"vue_003": relief})

    scene = trimesh.load(chemin)
    assert set(scene.graph.nodes_geometry) == {"nuage", "vue_003"}
    assert chemin.stat().st_size < 200_000  # texture en JPEG


def test_chaque_faille_recoit_son_relief_et_la_camera_de_son_image_cle(tmp_path):
    import cv2
    import numpy as np
    from types import SimpleNamespace

    from pipeline.analyse import reliefs_par_vue_cle

    chemin = tmp_path / "image_002.jpg"
    cv2.imwrite(str(chemin), np.full((400, 300, 3), 180, np.uint8))
    pose = np.eye(4)
    pose[:3, 3] = [0.5, 0.2, 1.0]
    reconstruit = SimpleNamespace(
        points=np.stack([_carte_de_points()] * 3) * [1, -1, -1], couleurs=np.zeros((3, 40, 30, 3), np.uint8), poses=np.stack([pose] * 3)
    )
    failles = [
        SimpleNamespace(position_3d={"image_cle": "image_002.jpg", "repere": "modele.glb", "centre": [0.1, 0.0, -2.0]}),
        SimpleNamespace(position_3d={"image_cle": "image_002.jpg", "repere": "modele.glb", "centre": [0.3, 0.0, -2.0]}),
        SimpleNamespace(position_3d={"image_cle": "image_002.jpg", "repere": "camera:image_002.jpg", "centre": None}),
    ]

    reliefs = reliefs_par_vue_cle(failles, {"image_002.jpg": {"chemin": chemin}}, reconstruit, {"image_002.jpg": 2}, facteur=1.0)

    assert list(reliefs) == ["vue_002"]  # deux points sur la même image : une seule surface
    assert failles[0].position_3d["relief"] == {"noeud": "vue_002", "camera": [0.5, -0.2, -1.0], "cible": [0.1, 0.0, -2.0]}
    assert failles[1].position_3d["relief"]["noeud"] == "vue_002"
    assert "relief" not in failles[2].position_3d


def test_un_objet_plus_grand_que_le_tapis_vu_en_entier_ne_l_absorbe_pas():
    paillasson = [_vue_3d("image_000.jpg", 0, (0.0, 0.0, 1.0)), _vue_3d("image_001.jpg", 0, (0.02, 0.0, 1.0))]
    for vue in paillasson:
        vue.largeur_cm, vue.longueur_cm = 40.0, 61.0
    parquet = _vue_3d("image_021.jpg", 1, (0.2, 0.0, 1.1))       # tout près, mais 88 cm visibles et coupé par le cadre
    parquet.coupe, parquet.largeur_cm, parquet.longueur_cm = True, 38.0, 88.0
    revu = _vue_3d("image_025.jpg", 2, (0.05, 0.0, 1.05))        # le paillasson revu plus tard, coupé : 40 × 35 visibles
    revu.coupe, revu.largeur_cm, revu.longueur_cm = True, 40.0, 35.0
    mesures = [*paillasson, parquet, revu]

    fusionner_instances_proches(mesures)

    assert [m.instance for m in mesures] == [0, 0, 1, 0]


def test_deux_fenetres_visibles_dans_la_meme_image_restent_deux_fenetres():
    mesures = [
        _vue_3d("image_010.jpg", 0, (0.0, 1.0, 3.0), element="fenetre"),
        _vue_3d("image_010.jpg", 1, (0.5, 1.0, 3.0), element="fenetre"),   # à 50 cm, mais dans la même image
        _vue_3d("image_020.jpg", 2, (0.05, 1.0, 3.0), element="fenetre"),  # la première, revue plus tard
    ]

    fusionner_instances_proches(mesures)

    assert [m.instance for m in mesures] == [0, 1, 0]
