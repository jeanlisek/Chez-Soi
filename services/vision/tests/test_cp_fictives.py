"""Conditions particulières FICTIVES de la persona Jeanne : document de test, sans valeur contractuelle."""

from pathlib import Path

from pypdf import PdfReader

from contrat.extraction import extraire
from contrat.lecture import lire_pypdf

DONNEES = Path(__file__).parent / "donnees"
PDF = DONNEES / "conditions_particulieres_fictives_jeanne.pdf"
MENTION = "DOCUMENT FICTIF – démo Chez Soi, sans valeur contractuelle"


def test_chaque_page_porte_la_mention_document_fictif():
    pages = lire_pypdf(PDF)

    assert pages
    assert all(MENTION in page.texte for page in pages)


def test_le_document_ne_contient_aucune_image_donc_aucun_logo():
    assert all(len(page.images) == 0 for page in PdfReader(str(PDF)).pages)


def test_l_extraction_retrouve_l_assureur_la_formule_et_la_reference_des_conditions_generales():
    resultat = extraire("cp-fictives-jeanne", lire_pypdf(PDF), "pypdf")

    assert (resultat.assureur, resultat.formule, resultat.reference_cg) == ("MAIF", "Raqvam", "M2442")
    assert {nom: champ.page for nom, champ in resultat.champs.items()} == {"assureur": 1, "formule": 1, "reference_cg": 1}


def test_le_document_ne_porte_aucune_obligation():
    # Il sert seulement à lancer la recherche des conditions générales (usage 1 de l'agent).
    assert extraire("cp-fictives-jeanne", lire_pypdf(PDF), "pypdf").obligations == []


def test_le_pdf_du_depot_est_celui_que_produit_le_script(tmp_path):
    from tests.donnees.generer_conditions_particulieres_fictives import generer

    assert generer(tmp_path / "copie.pdf").read_bytes() == PDF.read_bytes()
