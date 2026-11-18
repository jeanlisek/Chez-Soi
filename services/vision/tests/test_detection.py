from pipeline.detection import element_du_libelle, touche_le_bord


def test_element_du_libelle_traduit_le_libelle_du_detecteur():
    assert element_du_libelle("a rug") == ("tapis", "chute")
    assert element_du_libelle("smoke detector") == ("detecteur_fumee", "incendie")


def test_element_du_libelle_prend_le_terme_le_plus_precis():
    assert element_du_libelle("a door lock") == ("serrure", "intrusion")


def test_element_du_libelle_ignore_un_libelle_inconnu():
    assert element_du_libelle("a cat") is None


def test_une_boite_collee_au_bord_de_l_image_est_signalee():
    assert touche_le_bord((0, 200, 500, 600), largeur=1920, hauteur=1080)
    assert touche_le_bord((300, 200, 1915, 600), largeur=1920, hauteur=1080)
    assert not touche_le_bord((300, 200, 900, 600), largeur=1920, hauteur=1080)


def test_la_consigne_ne_contient_que_les_termes_demandes():
    from pipeline.detection import TERMES_COTES, consigne

    assert consigne(TERMES_COTES) == "a rug. a door. a window."
