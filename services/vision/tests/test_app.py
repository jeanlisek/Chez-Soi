import json
import time

import pytest
from fastapi.testclient import TestClient

import app as service
from pipeline.export import Faille

TAPIS = Faille(element="tapis", piece="sejour", risque="chute", cote_estimee_cm=158.0, largeur_cm=61.0, longueur_cm=158.0)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "DOSSIER_SORTIES", tmp_path / "sorties")
    monkeypatch.setattr(service, "DOSSIER_PRECALCULE", tmp_path / "precalcule")
    monkeypatch.delenv("VISION_API_KEY", raising=False)
    service.ANALYSES.clear()
    return TestClient(service.app)


def _attendre(client, analyse_id: str) -> dict:
    for _ in range(100):
        etat = client.get(f"/analyse/{analyse_id}").json()
        if etat["etat"] != "en_cours":
            return etat
        time.sleep(0.02)
    raise AssertionError("L'analyse ne se termine pas.")


def _calcul_reussi(video_url, sortie, logement_id, piece, pieces):
    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / "modele.glb").write_bytes(b"glTF")
    resultat = {"failles": [TAPIS], "image_annotee": None, "durees": {"total_s": 1.0}, "pieces": []}
    for p in pieces or []:
        (sortie / "pieces" / p.nom).mkdir(parents=True)
        (sortie / "pieces" / p.nom / "modele.glb").write_bytes(p.nom.encode())
        resultat["pieces"].append({"nom": p.nom, "modele_3d": f"pieces/{p.nom}/modele.glb", "image_annotee": None})
    return resultat


def _calcul_en_echec(video_url, sortie, logement_id, piece, pieces):
    raise RuntimeError("vidéo illisible")


def test_analyse_repond_tout_de_suite_puis_donne_les_failles(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_reussi)

    reponse = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"})

    assert reponse.status_code == 202
    assert reponse.json()["etat"] == "en_cours"
    etat = _attendre(client, reponse.json()["analyse_id"])
    assert (etat["etat"], etat["resultat"], etat["logement_id"]) == ("termine", "pipeline", "L1")
    assert etat["failles"][0]["longueur_cm"] == 158.0
    assert etat["modele_3d_url"].endswith("/fichiers/modele.glb")
    assert client.get(etat["modele_3d_url"]).content == b"glTF"


def test_un_calcul_en_echec_sert_le_resultat_precalcule(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_en_echec)
    service.DOSSIER_PRECALCULE.mkdir(parents=True)
    contenu = {"logement_id": "demo", "modele_3d": "modele.glb", "failles": [TAPIS.model_dump()]}
    (service.DOSSIER_PRECALCULE / "failles.json").write_text(json.dumps(contenu), encoding="utf-8")
    (service.DOSSIER_PRECALCULE / "modele.glb").write_bytes(b"precalcule")

    analyse_id = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}).json()["analyse_id"]
    etat = _attendre(client, analyse_id)

    assert (etat["etat"], etat["resultat"]) == ("termine", "precalcule")
    assert etat["failles"][0]["element"] == "tapis"
    assert "vidéo illisible" in etat["erreur"]
    assert client.get(etat["modele_3d_url"]).content == b"precalcule"


def test_un_calcul_en_echec_sans_plan_b_est_signale(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_en_echec)

    analyse_id = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}).json()["analyse_id"]
    etat = _attendre(client, analyse_id)

    assert (etat["etat"], etat["resultat"], etat["failles"]) == ("echec", None, [])


def test_une_analyse_inconnue_renvoie_404(client):
    assert client.get("/analyse/inconnue").status_code == 404


def test_un_fichier_hors_liste_est_refuse(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_reussi)
    analyse_id = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}).json()["analyse_id"]
    _attendre(client, analyse_id)

    assert client.get(f"/analyse/{analyse_id}/fichiers/secret.txt").status_code == 404


def test_une_url_qui_n_est_pas_https_est_refusee(client):
    reponse = client.post("/analyse", json={"logement_id": "L1", "video_url": "file:///etc/passwd"})
    assert reponse.status_code == 422


def test_la_cle_du_service_est_exigee_quand_elle_est_definie(client, monkeypatch):
    monkeypatch.setenv("VISION_API_KEY", "cle-de-test")
    corps = {"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}
    monkeypatch.setattr(service, "calculer", _calcul_reussi)

    assert client.post("/analyse", json=corps).status_code == 401
    # Authorization est réservé au jeton Hugging Face qui ouvre le Space privé : la clé a son propre en-tête.
    assert client.post("/analyse", json=corps, headers={"Authorization": "Bearer cle-de-test"}).status_code == 401
    assert client.post("/analyse", json=corps, headers={"X-Vision-Key": "cle-de-test"}).status_code == 202


def test_contrat_reste_un_stub(client):
    assert client.post("/contrat", json={"contrat_id": "C1", "pdf_url": "https://exemple.test/c.pdf"}).status_code == 501


def test_les_pieces_demandees_ont_chacune_leur_modele_3d(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_reussi)
    corps = {"logement_id": "L1", "video_url": "https://exemple.test/v.mp4",
             "pieces": [{"nom": "chambre", "debut_s": 21.0, "fin_s": 27.6}]}

    etat = _attendre(client, client.post("/analyse", json=corps).json()["analyse_id"])

    (piece,) = etat["pieces"]
    assert piece["nom"] == "chambre"
    assert client.get(piece["modele_3d_url"]).content == b"chambre"


def test_un_chemin_qui_sort_du_dossier_de_l_analyse_est_refuse(client, monkeypatch):
    monkeypatch.setattr(service, "calculer", _calcul_reussi)
    analyse_id = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}).json()["analyse_id"]
    _attendre(client, analyse_id)
    (service.DOSSIER_SORTIES / "failles.json").write_text("{}", encoding="utf-8")

    assert client.get(f"/analyse/{analyse_id}/fichiers/%2E%2E/failles.json").status_code == 404


def test_une_piece_dont_la_fin_precede_le_debut_est_refusee(client):
    corps = {"logement_id": "L1", "video_url": "https://exemple.test/v.mp4",
             "pieces": [{"nom": "chambre", "debut_s": 27.6, "fin_s": 21.0}]}
    assert client.post("/analyse", json=corps).status_code == 422


def test_health_dit_sur_quel_appareil_tournent_les_modeles(client, monkeypatch):
    monkeypatch.setattr(service, "appareil_de_calcul", lambda: "cuda")

    assert client.get("/health").json()["appareil"] == "cuda"
