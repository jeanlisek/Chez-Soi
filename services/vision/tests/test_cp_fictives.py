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


def test_la_clause_fictive_d_inoccupation_donne_30_jours_avec_sa_clause_et_sa_page():
    resultat = extraire("cp-fictives-jeanne", lire_pypdf(PDF), "pypdf")

    (inoccupation,) = [o for o in resultat.obligations if o.type == "inoccupation"]
    assert (inoccupation.seuil, inoccupation.unite, inoccupation.page) == (30, "jours", 1)
    assert inoccupation.clause == "Article 1 Inoccupation des locaux (clause fictive)"
    assert "informe l'assureur avant le départ" in inoccupation.citation
    assert inoccupation.citation_retrouvee


def test_les_protections_exigees_sont_les_portes_fermees_a_cle_et_les_volets_fermes():
    # get_contrat_champs (migration 0006) lit les protections dans les obligations de type « prevention ».
    resultat = extraire("cp-fictives-jeanne", lire_pypdf(PDF), "pypdf")

    protections = [o for o in resultat.obligations if o.type == "prevention"]
    assert {o.element: o.texte_court for o in protections} == {
        "porte_entree": "Toutes les portes d'accès, dont la porte d'entrée, doivent alors être fermées à clé.",
        "fenetre": "Les volets doivent alors être fermés.",
    }
    assert all(o.page == 1 and o.citation_retrouvee for o in protections)
    assert all(o.clause == "Article 1 Inoccupation des locaux (clause fictive)" for o in protections)


def test_aucune_clause_du_document_n_est_rejetee():
    assert extraire("cp-fictives-jeanne", lire_pypdf(PDF), "pypdf").clauses_rejetees == []


def test_le_pdf_du_depot_est_celui_que_produit_le_script(tmp_path):
    from tests.donnees.generer_conditions_particulieres_fictives import generer

    assert generer(tmp_path / "copie.pdf").read_bytes() == PDF.read_bytes()
