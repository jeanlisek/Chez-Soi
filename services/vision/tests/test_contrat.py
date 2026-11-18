"""Lecture du contrat : un PDF FICTIF généré pour le test (aucun vrai contrat, aucune donnée personnelle)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from contrat.extraction import extraire, trier
from contrat.lecture import lire_fichier
from contrat.schema import Obligation

PAGES = [
    [
        "CONDITIONS PARTICULIERES (document fictif de test)",
        "Assureur : Mutuelle Exemple",
        "Formule : Habitation Essentielle",
        "Conditions generales ref. CG2024-07 jointes au present contrat.",
    ],
    [
        "Article 12 Inoccupation des locaux",
        "Lorsque les locaux sont inoccupes plus de 30 jours consecutifs, la garantie vol est suspendue.",
        "Article 13 Mesures de prevention contre le vol",
        "Vous devez equiper la porte d'entree d'une serrure 3 points sous peine de non-garantie.",
        "Les volets doivent etre fermes pendant toute absence superieure a 24 heures.",
    ],
]


def pdf_fictif(chemin: Path) -> Path:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(chemin), pagesize=A4)
    for lignes in PAGES:
        y = 800
        for ligne in lignes:
            c.drawString(40, y, ligne)
            y -= 22
        c.showPage()
    c.save()
    return chemin


@pytest.fixture()
def pages(tmp_path):
    lues, moteur, _repli = lire_fichier(pdf_fictif(tmp_path / "contrat.pdf"))
    assert moteur in ("docling", "pypdf")
    return lues


def test_identification(pages):
    r = extraire("c1", pages, "pypdf")
    assert r.assureur == "Mutuelle Exemple"
    assert r.formule == "Habitation Essentielle"
    assert r.reference_cg == "CG2024-07"
    assert r.champs["reference_cg"].page == 1


def test_inoccupation_et_prevention(pages):
    r = extraire("c1", pages, "pypdf")
    inocc = [o for o in r.obligations if o.type == "inoccupation"]
    assert inocc and inocc[0].seuil == 30 and inocc[0].page == 2
    assert inocc[0].clause and inocc[0].clause.startswith("Article 12")
    assert inocc[0].citation_retrouvee
    serrure = [o for o in r.obligations if o.type == "prevention" and o.element == "serrure"]
    assert serrure and serrure[0].clause.startswith("Article 13")


def test_citation_inventee_rejetee(pages):
    invente = Obligation(
        type="exclusion", texte_court="Exclusion inventée", citation="Les dégâts des eaux ne sont jamais couverts par ce contrat.",
        clause="Article 99", page=2, origine="llm",
    )
    sans_page = Obligation(type="garantie", texte_court="Sans page", citation="la garantie vol est suspendue", origine="llm")
    retenues, rejets = trier([invente, sans_page], pages)
    assert retenues == []
    assert {r.raison for r in rejets} == {"citation absente de la page 2", "clause ou page introuvable"}


def test_route(monkeypatch, pages):
    import app as service

    monkeypatch.setattr("contrat.routes.lire_url", lambda url: (pages, "pypdf", None))
    monkeypatch.delenv("VISION_API_KEY", raising=False)
    client = TestClient(service.app)
    r = client.post("/contrat", json={"contrat_id": "c1", "pdf_url": "https://exemple.test/contrat.pdf"})
    assert r.status_code == 200
    corps = r.json()
    assert corps["reference_cg"] == "CG2024-07"
    assert any(o["type"] == "inoccupation" and o["page"] == 2 for o in corps["obligations"])
    assert client.post("/contrat", json={"contrat_id": "c1", "pdf_url": "http://exemple.test/a.pdf"}).status_code == 422


def test_cle_exigee(monkeypatch, pages):
    import app as service

    monkeypatch.setattr("contrat.routes.lire_url", lambda url: (pages, "pypdf", None))
    monkeypatch.setenv("VISION_API_KEY", "cle-de-test")
    client = TestClient(service.app)
    corps = {"contrat_id": "c1", "pdf_url": "https://exemple.test/contrat.pdf"}
    assert client.post("/contrat", json=corps).status_code == 401
    assert client.post("/contrat", json=corps, headers={"X-Vision-Key": "cle-de-test"}).status_code == 200


# --- Choix du moteur de lecture et raison du repli -------------------------------------------------


def _docling_interdit(chemin):
    raise AssertionError("Docling ne doit pas être tenté hors ligne.")


def test_hors_ligne_docling_n_est_pas_tente_et_la_reponse_dit_pourquoi(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setattr("contrat.lecture.lire_docling", _docling_interdit)

    lues, moteur, repli = lire_fichier(pdf_fictif(tmp_path / "contrat.pdf"))

    assert (moteur, repli) == ("pypdf", "docling indisponible hors ligne")
    assert [p.numero for p in lues] == [1, 2]


def test_en_ligne_un_echec_de_docling_est_nomme_dans_le_repli(tmp_path, monkeypatch):
    def en_echec(chemin):
        raise RuntimeError("modèle introuvable")

    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setattr("contrat.lecture.lire_docling", en_echec)

    _, moteur, repli = lire_fichier(pdf_fictif(tmp_path / "contrat.pdf"))

    assert (moteur, repli) == ("pypdf", "docling en échec : RuntimeError")


def test_quand_docling_lit_le_pdf_il_n_y_a_pas_de_repli(tmp_path, monkeypatch):
    from contrat.schema import Page

    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setattr("contrat.lecture.lire_docling", lambda chemin: [Page(numero=1, texte="Texte lu par Docling.")])

    _, moteur, repli = lire_fichier(pdf_fictif(tmp_path / "contrat.pdf"))

    assert (moteur, repli) == ("docling", None)


def test_la_reponse_de_la_route_porte_le_moteur_et_la_raison_du_repli(monkeypatch, pages):
    import app as service

    monkeypatch.setattr("contrat.routes.lire_url", lambda url: (pages, "pypdf", "docling indisponible hors ligne"))
    monkeypatch.delenv("VISION_API_KEY", raising=False)

    corps = TestClient(service.app).post("/contrat", json={"contrat_id": "c1", "pdf_url": "https://exemple.test/c.pdf"}).json()

    assert (corps["moteur"], corps["repli"]) == ("pypdf", "docling indisponible hors ligne")
