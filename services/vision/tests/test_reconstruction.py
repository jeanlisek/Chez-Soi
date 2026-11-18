import numpy as np

from pipeline.reconstruction import centre_dans_la_vue, nuage_fusionne


def test_nuage_fusionne_ecarte_les_points_invalides_et_respecte_le_plafond():
    points = np.random.default_rng(0).uniform(-1, 1, (2, 10, 20, 3))
    points[0, :5] = np.nan
    couleurs = np.full((2, 10, 20, 3), 100, np.uint8)

    tous, _ = nuage_fusionne(points, couleurs, max_points=10_000)
    reduits, couleurs_reduites = nuage_fusionne(points, couleurs, max_points=50)

    assert len(tous) == 2 * 10 * 20 - 5 * 20
    assert np.isfinite(tous).all()
    assert len(reduits) == len(couleurs_reduites) == 50


def test_centre_dans_la_vue_prend_la_mediane_des_points_sous_le_masque_redimensionne():
    points = np.zeros((30, 40, 3))
    points[..., 2] = 5.0
    points[15:, 20:] = (1.0, 2.0, 3.0)
    masque = np.zeros((300, 400), bool)  # masque à la résolution de l'image d'origine, 10 fois plus grande
    masque[160:290, 210:390] = True

    assert centre_dans_la_vue(points, masque) == (1.0, 2.0, 3.0)


def test_centre_dans_la_vue_sans_point_valide_ne_donne_rien():
    points = np.full((30, 40, 3), np.nan)
    assert centre_dans_la_vue(points, np.ones((300, 400), bool)) is None


def test_le_code_dinov2_est_charge_depuis_le_dossier_fige_et_non_depuis_github():
    from pipeline.reconstruction import hub_fige

    appels = []

    def charger_d_origine(depot, modele, *args, **options):
        appels.append((depot, modele, options))
        return "modele"

    charger = hub_fige(charger_d_origine, dossier_dinov2="/cache/dinov2_fige")

    assert charger("facebookresearch/dinov2", "dinov2_vitg14", force_reload=False, pretrained=False) == "modele"
    assert appels[-1] == ("/cache/dinov2_fige", "dinov2_vitg14", {"source": "local", "pretrained": False})


def test_les_autres_depots_torch_hub_ne_sont_pas_detournes():
    from pipeline.reconstruction import hub_fige

    appels = []
    charger = hub_fige(lambda depot, modele, **options: appels.append((depot, options)), dossier_dinov2="/cache/dinov2_fige")

    charger("autre/depot", "modele", pretrained=True)

    assert appels == [("autre/depot", {"pretrained": True})]
