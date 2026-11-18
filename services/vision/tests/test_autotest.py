import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as service
from pipeline.autotest import images_de_synthese


def test_les_images_de_synthese_sont_des_vues_decalees_d_une_meme_scene():
    images = images_de_synthese(nb=4)

    assert len(images) == 4
    assert all(image.shape == (720, 1280, 3) and image.dtype == np.uint8 for image in images)
    assert (images[0] != images[1]).any()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("VISION_API_KEY", "cle-de-test")
    service.AUTOTESTS.clear()
    return TestClient(service.app)


def _attendre(client, autotest_id: str) -> dict:
    for _ in range(100):
        etat = client.get(f"/autotest/{autotest_id}", headers={"X-Vision-Key": "cle-de-test"}).json()
        if etat["etat"] != "en_cours":
            return etat
        time.sleep(0.02)
    raise AssertionError("L'auto-test ne se termine pas.")


def test_l_autotest_repond_tout_de_suite_puis_donne_les_durees_par_modele(client, monkeypatch):
    monkeypatch.setattr(service, "lancer_autotest", lambda: {"appareil": "cuda", "modeles": [{"modele": "m", "chargement_s": 1.0}]})

    reponse = client.post("/autotest", headers={"X-Vision-Key": "cle-de-test"})

    assert reponse.status_code == 202
    etat = _attendre(client, reponse.json()["autotest_id"])
    assert etat["etat"] == "termine"
    assert etat["resultat"]["modeles"][0]["chargement_s"] == 1.0


def test_un_autotest_en_echec_garde_l_erreur(client, monkeypatch):
    def en_echec():
        raise RuntimeError("mémoire GPU insuffisante")

    monkeypatch.setattr(service, "lancer_autotest", en_echec)

    etat = _attendre(client, client.post("/autotest", headers={"X-Vision-Key": "cle-de-test"}).json()["autotest_id"])

    assert etat["etat"] == "echec"
    assert "mémoire GPU insuffisante" in etat["erreur"]


def test_l_autotest_exige_la_cle_du_service(client):
    assert client.post("/autotest").status_code == 401
    assert client.get("/autotest/x").status_code == 401


def test_l_autotest_est_refuse_tant_qu_aucune_cle_n_est_definie(client, monkeypatch):
    monkeypatch.delenv("VISION_API_KEY")

    assert client.post("/autotest").status_code == 403
