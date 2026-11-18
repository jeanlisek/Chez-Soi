"""Génère les conditions particulières FICTIVES de la persona Jeanne, pour les tests et la démo.

Document volontairement nu : ni logo ni mise en page d'assureur, et la mention « DOCUMENT FICTIF » en haut
et en bas de chaque page. Il porte :
- l'assureur, la formule et la référence des conditions générales, pour que l'usage 1 de l'agent aille
  chercher les conditions générales publiques ;
- une clause d'inoccupation INVENTÉE pour la démo (30 jours, information de l'assureur, portes fermées à clé,
  volets fermés). Les conditions générales publiques citées ne contiennent pas de telle clause.

La clause est écrite en trois phrases, une par exigence : la lecture du contrat range la durée dans une
obligation « inoccupation » et chaque protection dans une obligation « prevention », et c'est dans ces
dernières que la base lit les protections (get_contrat_champs, migration 0006).

Depuis services/vision : .venv/bin/python -m tests.donnees.generer_conditions_particulieres_fictives
"""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

MENTION = "DOCUMENT FICTIF – démo Chez Soi, sans valeur contractuelle"
PDF = Path(__file__).parent / "conditions_particulieres_fictives_jeanne.pdf"

PAGES = [
    [
        ("titre", "Conditions particulières"),
        ("texte", "Persona de démonstration : Jeanne (personnage inventé)"),
        ("espace", ""),
        ("texte", "Assureur : MAIF"),
        ("texte", "Formule : Raqvam"),
        ("texte", "Conditions générales applicables : réf. M2442"),
        ("espace", ""),
        ("article", "Article 1 Inoccupation des locaux (clause fictive)"),
        ("texte", "En cas d'inoccupation de plus de 30 jours consécutifs, l'assuré informe l'assureur"),
        ("texte", "avant le départ."),
        ("texte", "Toutes les portes d'accès, dont la porte d'entrée, doivent alors être fermées à clé."),
        ("texte", "Les volets doivent alors être fermés."),
        ("espace", ""),
        ("note", "Ce document a été créé par l'équipe Chez Soi pour ses tests et sa démonstration."),
        ("note", "Il n'émane pas de l'assureur cité, n'engage personne et ne décrit aucun contrat réel."),
        ("note", "Il ne contient aucune donnée personnelle."),
    ],
]


def _bandeau(page: canvas.Canvas, largeur: float, hauteur: float) -> None:
    """La mention « document fictif », en haut et en bas de la page."""
    page.setFont("Helvetica-Bold", 11)
    for y in (hauteur - 36, 30):
        page.drawCentredString(largeur / 2, y, MENTION)


def generer(chemin: Path = PDF) -> Path:
    largeur, hauteur = A4
    # invariant=1 : pas de date ni d'identifiant aléatoire, le fichier est identique à chaque génération.
    page = canvas.Canvas(str(chemin), pagesize=A4, invariant=1)
    page.setTitle(MENTION)
    page.setAuthor("Chez Soi (document de test)")
    for lignes in PAGES:
        _bandeau(page, largeur, hauteur)
        y = hauteur - 110
        for style, texte in lignes:
            if style == "titre":
                page.setFont("Helvetica-Bold", 18)
            elif style == "article":
                page.setFont("Helvetica-Bold", 12)
            elif style == "note":
                page.setFont("Helvetica-Oblique", 10)
            else:
                page.setFont("Helvetica", 12)
            if texte:
                page.drawString(60, y, texte)
            y -= 34 if style == "titre" else 22
        page.showPage()
    page.save()
    return chemin


if __name__ == "__main__":
    print(generer())
