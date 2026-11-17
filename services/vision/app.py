"""Service vision de Chez Soi (couche « Voir »).

Squelette : les deux routes renvoient un stub typé, sans aucun traitement.
À terme, elles sont asynchrones et n8n écrit les résultats dans Supabase.
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Chez Soi · service vision", version="0.1.0")


class AnalyseRequete(BaseModel):
    logement_id: str
    video_url: str


class ContratRequete(BaseModel):
    contrat_id: str
    pdf_url: str


class StubReponse(BaseModel):
    stub: bool = True
    route: str
    message: str = "Non implémenté : squelette du monorepo."


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyse", response_model=StubReponse, status_code=501)
def analyse(requete: AnalyseRequete) -> StubReponse:
    """Vidéo du logement → reconstruction 3D, cotes, failles."""
    return StubReponse(route="/analyse")


@app.post("/contrat", response_model=StubReponse, status_code=501)
def contrat(requete: ContratRequete) -> StubReponse:
    """PDF du contrat → champs extraits, chacun avec sa clause et sa page."""
    return StubReponse(route="/contrat")
