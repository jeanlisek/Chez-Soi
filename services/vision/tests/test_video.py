import io
import json
import time

import pytest
from fastapi.testclient import TestClient

import app as service

MO = 1024 * 1024


class _Reponse(io.BytesIO):
    """Imite la réponse HTTP d'un téléchargement : un flux d'octets et des en-têtes."""

    def __init__(self, contenu: bytes, taille_annoncee: int | None):
        super().__init__(contenu)
        self.headers = {} if taille_annoncee is None else {"Content-Length": str(taille_annoncee)}


def test_une_video_annoncee_a_plus_de_50_mo_est_refusee_avant_tout_telechargement(tmp_path):
    reponse = _Reponse(b"", taille_annoncee=62 * MO)

    with pytest.raises(service.VideoTropLourde) as refus:
        service.telecharger_video(reponse, tmp_path / "video")

    assert str(refus.value) == (
        "Vidéo trop lourde (62 Mo, 50 Mo au plus) : une vidéo par pièce, environ 30 secondes en 720p."
    )
    assert not (tmp_path / "video").exists()


def test_une_video_trop_lourde_sans_taille_annoncee_est_arretee_en_cours_de_route(tmp_path):
    reponse = _Reponse(b"x" * (3 * MO), taille_annoncee=None)

    with pytest.raises(service.VideoTropLourde):
        service.telecharger_video(reponse, tmp_path / "video", taille_max=2 * MO)

    assert not (tmp_path / "video").exists()


def test_une_video_sous_la_limite_est_enregistree(tmp_path):
    service.telecharger_video(_Reponse(b"x" * MO, taille_annoncee=MO), tmp_path / "video")

    assert (tmp_path / "video").stat().st_size == MO


def test_la_limite_du_service_est_de_50_mo():
    assert service.TAILLE_MAX_VIDEO == 50 * MO


def test_une_video_trop_lourde_est_un_refus_et_ne_declenche_pas_le_plan_b(tmp_path, monkeypatch):
    def trop_lourde(video_url, sortie, logement_id, piece, pieces):
        raise service.VideoTropLourde(62 * MO)

    monkeypatch.setattr(service, "calculer", trop_lourde)
    monkeypatch.setattr(service, "DOSSIER_PRECALCULE", tmp_path / "precalcule")
    monkeypatch.delenv("VISION_API_KEY", raising=False)
    service.DOSSIER_PRECALCULE.mkdir()
    (service.DOSSIER_PRECALCULE / "failles.json").write_text(json.dumps({"failles": []}), encoding="utf-8")
    client = TestClient(service.app)

    analyse_id = client.post("/analyse", json={"logement_id": "L1", "video_url": "https://exemple.test/v.mp4"}).json()["analyse_id"]
    for _ in range(100):
        etat = client.get(f"/analyse/{analyse_id}").json()
        if etat["etat"] != "en_cours":
            break
        time.sleep(0.02)

    assert (etat["etat"], etat["resultat"]) == ("echec", None)
    assert etat["erreur"].startswith("Vidéo trop lourde (62 Mo, 50 Mo au plus)")
