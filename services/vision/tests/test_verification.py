import numpy as np

from pipeline.analyse import MesureVue, construire_failles
from pipeline.verification import DESCRIPTIONS, avis, decouper, verifier_failles


class FauxVerificateur:
    """Répond d'après la couleur de la découpe : blanc = l'élément annoncé, noir = sa première confusion."""

    def __init__(self):
        self.appels = 0

    def probabilites(self, decoupes, textes):
        self.appels += 1
        sorties = []
        for d in decoupes:
            p = np.full(len(textes), 0.01)
            p[0 if d.mean() > 127 else len(textes) - 1] = 1.0
            sorties.append(p / p.sum())
        return sorties


def _mesure(element, image, boite, instance=0):
    m = MesureVue(element, "chute", image, 0.6, boite, centre=(0.0, 0.0, 1.0))
    m.instance = instance
    return m


def test_la_decoupe_ajoute_du_contexte_sans_sortir_de_l_image():
    image = np.zeros((100, 200, 3), np.uint8)
    assert decouper(image, (90, 40, 110, 60)).shape[:2] == (96, 96)
    assert decouper(image, (0, 0, 10, 10)).shape[:2] == (53, 53)
    assert decouper(image, (10, 10, 190, 90), cote_min=0).shape[:2] == (100, 200)


def test_un_point_qui_ressemble_surtout_a_une_confusion_est_retire():
    positifs, negatifs = DESCRIPTIONS["detecteur_fumee"]
    n = len(positifs) + len(negatifs)
    pomme = np.full(n, 0.02); pomme[len(positifs)] = 0.9
    resultat = avis([pomme / pomme.sum()], positifs, negatifs)
    assert not resultat.garde and resultat.confusion == "a shower head"


def test_le_score_est_la_moyenne_des_vues():
    positifs, negatifs = ["a rug"], ["a floor"]
    resultat = avis([np.array([0.9, 0.1]), np.array([0.3, 0.7])], positifs, negatifs)
    assert resultat.score == 0.6 and resultat.garde and resultat.nb_vues == 2


def test_verifier_failles_retire_les_faux_et_garde_les_autres():
    blanc = np.full((200, 200, 3), 255, np.uint8)
    noir = np.zeros((200, 200, 3), np.uint8)
    images = {"a.jpg": blanc, "b.jpg": noir}
    mesures = [
        _mesure("serrure", "a.jpg", (50, 50, 80, 90), 0),
        _mesure("serrure", "a.jpg", (52, 50, 82, 92), 0),
        _mesure("detecteur_fumee", "b.jpg", (60, 60, 90, 90), 0),
        _mesure("detecteur_fumee", "b.jpg", (61, 60, 91, 90), 0),
    ]
    failles = construire_failles(mesures, "salle de bain")
    faux = FauxVerificateur()
    gardees, retirees = verifier_failles(failles, mesures, images.get, faux)
    assert [f.element for f in gardees] == ["serrure"]
    assert [f.element for f in retirees] == ["detecteur_fumee"]
    assert retirees[0].position_3d["verification"]["confusion"] == DESCRIPTIONS["detecteur_fumee"][1][-1]
    assert gardees[0].position_3d["verification"]["nb_vues"] == 2


def test_un_element_sans_description_ou_sans_image_est_garde():
    mesures = [_mesure("feuille_a4", "a.jpg", (0, 0, 10, 10)), _mesure("tapis", "absente.jpg", (0, 0, 10, 10))]
    failles = construire_failles(mesures, None)
    faux = FauxVerificateur()
    gardees, retirees = verifier_failles(failles, mesures, lambda nom: None, faux)
    assert len(gardees) == len(failles) and not retirees and faux.appels == 0


def test_tous_les_elements_detectes_ont_une_description():
    from pipeline.detection import ELEMENTS

    assert {e for e, _ in ELEMENTS.values()} - {"feuille_a4"} <= set(DESCRIPTIONS)


def test_l_analyse_retire_le_faux_detecteur_et_trace_la_decision(tmp_path, monkeypatch):
    import cv2

    from pipeline import analyse
    from pipeline.detection import Detection

    class FauxDetecteur:
        def detecter(self, rvb, termes, seuil):
            if "smoke detector" not in termes:
                return []
            return [Detection("detecteur_fumee", "incendie", 0.6, (100, 100, 140, 140)),
                    Detection("eclairage", "chute", 0.6, (300, 100, 340, 140))]

        def ajouter_masques(self, rvb, detections):
            pass

    class FausseProfondeur:
        def points(self, rvb):
            h, w = rvb.shape[:2]
            xs, ys = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-0.7, 0.7, h))
            return np.dstack([xs, ys, np.full_like(xs, 2.0)]).astype(np.float32)

    class ParPosition:
        """Le point de gauche ressemble à une pomme de douche, celui de droite à un plafonnier."""

        def probabilites(self, decoupes, textes):
            return [np.eye(len(textes))[len(textes) - 1 if d[..., 0].mean() < 127 else 0] for d in decoupes]

    images = []
    for i in range(3):
        image = np.zeros((480, 640, 3), np.uint8)
        image[:, 240:] = 255  # moitié droite claire
        chemin = tmp_path / f"image_{i:03d}.jpg"
        cv2.imwrite(str(chemin), image)
        images.append(chemin)
    monkeypatch.setattr(analyse, "charger_modeles", lambda appareil: (FauxDetecteur(), FausseProfondeur()))
    monkeypatch.setattr(analyse, "charger_verificateur", lambda appareil: ParPosition())
    monkeypatch.setattr(analyse, "choisir_appareil", lambda: "cpu")

    resultat = analyse.analyser_images(images, tmp_path / "sortie", "logement", "salle de bain",
                                       presence=True, verification=True)
    assert [f.element for f in resultat["failles"]] == ["eclairage"]
    assert resultat["points_retires"] == 1
    import json

    trace = json.loads((tmp_path / "sortie" / "verification.json").read_text())
    assert {(t["element"], t["garde"]) for t in trace} == {("eclairage", True), ("detecteur_fumee", False)}


def test_sans_modele_de_verification_tous_les_points_sont_gardes():
    from pipeline import analyse

    def echec(appareil):
        raise OSError("hors ligne")

    analyse_orig = analyse.charger_verificateur
    analyse.charger_verificateur = echec
    try:
        gardees, retirees, avertissement = analyse.verifier_avec_siglip(["f"], [], {}, "cpu")
    finally:
        analyse.charger_verificateur = analyse_orig
    assert gardees == ["f"] and not retirees and "hors ligne" in avertissement
