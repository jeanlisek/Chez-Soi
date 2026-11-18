"""Lecture du PDF du contrat, page par page.

Docling d'abord (mise en page, tableaux, ordre de lecture) ; pypdf en secours si Docling n'est pas
installé ou échoue. Le PDF est téléchargé dans un fichier temporaire, jamais conservé, et ne quitte
pas le service : seuls les champs extraits, avec leur clause et leur page, en sortent.
"""

from __future__ import annotations

import tempfile
import urllib.request
from pathlib import Path

from contrat.schema import Page

TAILLE_MAX = 20 * 1024 * 1024  # 20 Mo : un contrat d'assurance habitation fait rarement plus de 3 Mo


class ContratIllisible(Exception):
    """PDF absent, trop lourd, chiffré ou sans texte."""


def telecharger(url: str, destination: Path) -> None:
    requete = urllib.request.Request(url, headers={"User-Agent": "ChezSoi-vision/1.0"})
    with urllib.request.urlopen(requete, timeout=60) as source:
        annonce = source.headers.get("Content-Length")
        if annonce and int(annonce) > TAILLE_MAX:
            raise ContratIllisible(f"Contrat trop lourd ({int(annonce) // 1_048_576} Mo, 20 Mo au plus).")
        total = 0
        with destination.open("wb") as sortie:
            while bloc := source.read(1 << 16):
                total += len(bloc)
                if total > TAILLE_MAX:
                    raise ContratIllisible("Contrat trop lourd (20 Mo au plus).")
                sortie.write(bloc)
    if destination.read_bytes()[:5] != b"%PDF-":
        raise ContratIllisible("Le fichier reçu n'est pas un PDF.")


def lire_docling(chemin: Path) -> list[Page]:
    from docling.document_converter import DocumentConverter

    document = DocumentConverter().convert(str(chemin)).document
    pages: dict[int, list[str]] = {}
    for element, _niveau in document.iterate_items():
        texte = getattr(element, "text", None)
        provenance = getattr(element, "prov", None) or []
        if not texte or not provenance:
            continue
        pages.setdefault(provenance[0].page_no, []).append(texte)
    return [Page(numero=n, texte="\n".join(lignes)) for n, lignes in sorted(pages.items())]


def lire_pypdf(chemin: Path) -> list[Page]:
    from pypdf import PdfReader

    lecteur = PdfReader(str(chemin))
    if lecteur.is_encrypted:
        raise ContratIllisible("Le PDF est protégé par un mot de passe.")
    return [Page(numero=i + 1, texte=p.extract_text() or "") for i, p in enumerate(lecteur.pages)]


def lire_fichier(chemin: Path) -> tuple[list[Page], str]:
    """Pages du PDF et moteur utilisé (« docling » ou « pypdf »)."""
    try:
        pages, moteur = lire_docling(chemin), "docling"
    except Exception:  # Docling absent ou en échec : on lit quand même le texte
        pages, moteur = lire_pypdf(chemin), "pypdf"
    if not any(p.texte.strip() for p in pages):
        raise ContratIllisible("Aucun texte lisible dans le PDF (document scanné ?).")
    return pages, moteur


def lire_url(url: str) -> tuple[list[Page], str]:
    with tempfile.TemporaryDirectory() as dossier:
        chemin = Path(dossier) / "contrat.pdf"
        telecharger(url, chemin)
        return lire_fichier(chemin)
