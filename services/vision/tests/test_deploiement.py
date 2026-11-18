from deployer_space import fichiers_a_envoyer


def _creer(racine, chemins):
    for chemin in chemins:
        (racine / chemin).parent.mkdir(parents=True, exist_ok=True)
        (racine / chemin).write_text("x")


def test_le_deploiement_envoie_le_service_et_le_plan_b_mais_ni_videos_ni_resultats_locaux(tmp_path):
    _creer(tmp_path, [
        "app.py", "Dockerfile", "pipeline/analyse.py", "precalcule/demo/failles.json",
        "precalcule/demo/pieces/chambre/modele.glb", "precalcule/demo/pieces/chambre/image_annotee.jpg",
        ".venv/lib/x.py", "tests/test_app.py", "donnees/video.mp4", "donnees/pieces.json", "sorties/loom/chambre_3d.jpg",
        ".pytest_cache/v", ".DS_Store", "pipeline/__pycache__/analyse.cpython-311.pyc", "deployer_space.py",
    ])

    assert fichiers_a_envoyer(tmp_path) == [
        "Dockerfile", "app.py", "pipeline/analyse.py", "precalcule/demo/failles.json",
        "precalcule/demo/pieces/chambre/image_annotee.jpg", "precalcule/demo/pieces/chambre/modele.glb",
    ]
