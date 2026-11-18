"""Génère les conditions particulières FICTIVES de la persona Jeanne, pour les tests et la démo.

Document volontairement nu : ni logo ni mise en page d'assureur, et la mention « DOCUMENT FICTIF » en haut
et en bas de chaque page. Il ne porte que trois informations (assureur, formule, référence des conditions
générales), pour que l'usage 1 de l'agent aille chercher les conditions générales publiques.

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
