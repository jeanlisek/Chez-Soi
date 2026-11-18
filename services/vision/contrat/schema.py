"""Schémas Pydantic de la lecture du contrat.

Format de sortie aligné sur ce que lit le workflow n8n `analyse_contrat` (n8n/README.md) :
`{ assureur, formule, reference_cg, obligations: [ { type, element, seuil, unite, texte_court,
citation, clause, page, citation_retrouvee } ] }`, plus `clauses_rejetees`.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TypeObligation = Literal["prevention", "inoccupation", "exclusion", "garantie", "franchise", "plafond"]


class ContratRequete(BaseModel):
    contrat_id: str
    pdf_url: str

    @field_validator("pdf_url")
    @classmethod
    def _https(cls, url: str) -> str:
        if not url.startswith("https://"):
            raise ValueError("L'URL du contrat doit être en https.")
        return url


class Page(BaseModel):
    numero: int = Field(ge=1)
    texte: str


class Obligation(BaseModel):
    type: TypeObligation
    element: str | None = None
    seuil: float | None = None
    unite: str | None = None
    texte_court: str
    citation: str
    clause: str | None = None
    page: int | None = None
    citation_retrouvee: bool = False
    origine: Literal["regle", "llm"] = "regle"


class ChampCite(BaseModel):
    """Champ d'identification du contrat, avec l'endroit où il a été lu."""

    valeur: str
    page: int
    citation: str


class Rejet(BaseModel):
    texte_court: str
    raison: str


class ResultatContrat(BaseModel):
    contrat_id: str
    statut: Literal["ok", "vide"] = "ok"
    assureur: str | None = None
    formule: str | None = None
    reference_cg: str | None = None
    champs: dict[str, ChampCite] = {}
    obligations: list[Obligation] = []
    clauses_rejetees: list[Rejet] = []
    pages: int = 0
    moteur: Literal["docling", "pypdf"] = "pypdf"
    llm: bool = False
