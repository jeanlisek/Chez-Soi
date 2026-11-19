"""Service vision de Chez Soi (couche « Voir »).

POST /analyse répond tout de suite (202) ; le calcul tourne en tâche de fond. n8n lit l'état avec
GET /analyse/{analyse_id}, récupère les fichiers puis écrit dans Supabase. Le service n'a aucune clé Supabase.
Si le calcul échoue et qu'un résultat précalculé existe (plan B de la démo), il est servi tel quel.
"""

import json
import os
import secrets
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from pipeline.export import Faille

RACINE = Path(__file__).parent
DOSSIER_SORTIES = Path(os.environ.get("VISION_SORTIES", "/tmp/chez-soi-vision"))
DOSSIER_PRECALCULE = RACINE / "precalcule" / "demo"
FICHIERS_SERVIS = {"modele.glb", "image_annotee.jpg", "failles.json"}
MO = 1024 * 1024
TAILLE_MAX_VIDEO = 50 * MO  # même limite que le bucket `videos` de Supabase (issue #22)


class VideoTropLourde(ValueError):
    """Refus d'une vidéo au-delà de la limite : ce n'est pas un échec du calcul, le plan B ne s'applique pas."""

    def __init__(self, taille_octets: int | None = None, taille_max: int = TAILLE_MAX_VIDEO):
        limite = f"{taille_max // MO} Mo"
        taille = f"{round(taille_octets / MO)} Mo, {limite} au plus" if taille_octets else f"plus de {limite}"
        super().__init__(f"Vidéo trop lourde ({taille}) : une vidéo par pièce, environ 30 secondes en 720p.")


def telecharger_video(reponse, cible: Path, taille_max: int = TAILLE_MAX_VIDEO) -> None:
    """Enregistre la vidéo. Refuse d'après la taille annoncée, sinon arrête dès que la limite est dépassée."""
    annoncee = int(reponse.headers.get("Content-Length") or 0)
    if annoncee > taille_max:
        raise VideoTropLourde(annoncee, taille_max)
    recu = 0
    with open(cible, "wb") as fichier:
        while bloc := reponse.read(MO):
            recu += len(bloc)
            if recu > taille_max:
                break
            fichier.write(bloc)
    if recu > taille_max:
        cible.unlink(missing_ok=True)
        raise VideoTropLourde(None, taille_max)

app = FastAPI(title="Chez Soi · service vision", version="0.2.0")
ANALYSES: dict[str, "AnalyseEtat"] = {}
AUTOTESTS: dict[str, "AutotestEtat"] = {}
_file_de_calcul = ThreadPoolExecutor(max_workers=1)  # un seul calcul à la fois : le GPU n'est pas partagé


class PieceRequete(BaseModel):
    """Segment de la vidéo qui montre une pièce (table `pieces` : nom, debut_s, fin_s)."""

    nom: str = Field(min_length=1)
    debut_s: float = Field(ge=0)
    fin_s: float

    @model_validator(mode="after")
    def _fin_apres_debut(self) -> "PieceRequete":
        if self.fin_s <= self.debut_s:
            raise ValueError("fin_s doit être après debut_s.")
        return self


class PieceEtat(BaseModel):
    nom: str
    modele_3d_url: str | None = None
    image_annotee_url: str | None = None

# Lecture du contrat (Docling) : déclarée avant les autres routes, elle remplace le stub /contrat.
from contrat.routes import router as routeur_contrat  # noqa: E402

app.include_router(routeur_contrat)


class AnalyseRequete(BaseModel):
    logement_id: str
    video_url: HttpUrl
    piece: str | None = None
    pieces: list[PieceRequete] | None = None  # découpage de la vidéo : une analyse et un modèle 3D par pièce

    @field_validator("video_url")
    @classmethod
    def _https_seulement(cls, url: HttpUrl) -> HttpUrl:
        if url.scheme != "https":
            raise ValueError("L'URL de la vidéo doit être en https.")
        return url


class AnalyseEtat(BaseModel):
    analyse_id: str
    logement_id: str
    etat: Literal["en_cours", "termine", "echec"] = "en_cours"
    resultat: Literal["pipeline", "precalcule"] | None = None
    failles: list[Faille] = []
    pieces: list[PieceEtat] = []
    modele_3d_url: str | None = None
    image_annotee_url: str | None = None
    durees: dict | None = None
    erreur: str | None = None


class AutotestEtat(BaseModel):
    autotest_id: str
    etat: Literal["en_cours", "termine", "echec"] = "en_cours"
    resultat: dict | None = None
    erreur: str | None = None


class ContratRequete(BaseModel):
    contrat_id: str
    pdf_url: str


class StubReponse(BaseModel):
    stub: bool = True
    route: str
    message: str = "Non implémenté : squelette du monorepo."


def verifier_cle(x_vision_key: str | None = Header(default=None)) -> None:
    """Si VISION_API_KEY est définie, chaque appel doit la présenter dans l'en-tête X-Vision-Key.

    L'en-tête Authorization n'est pas utilisé : sur un Space privé, il porte le jeton Hugging Face.
    """
    cle = os.environ.get("VISION_API_KEY")
    if cle and not secrets.compare_digest((x_vision_key or "").encode(), cle.encode()):
        raise HTTPException(status_code=401, detail="Clé du service vision absente ou invalide.")


def calculer(video_url: str, sortie: Path, logement_id: str, piece: str | None,
             pieces: list[PieceRequete] | None) -> dict:
    """Télécharge la vidéo puis lance le pipeline. Les modèles ne sont chargés qu'au premier calcul."""
    from pipeline.analyse import Piece, analyser_video

    sortie.mkdir(parents=True, exist_ok=True)
    video = sortie / "video"
    with urllib.request.urlopen(video_url, timeout=60) as source:
        telecharger_video(source, video)
    try:
        return analyser_video(video, sortie, logement_id, piece,
                              reconstruction=os.environ.get("VISION_RECONSTRUCTION") == "1",
                              # Serrure, escalier, plafonnier, interrupteur, détecteur de fumée : repérés sans cote.
                              presence=os.environ.get("VISION_PRESENCE", "1") == "1",
                              pieces=[Piece(p.nom, p.debut_s, p.fin_s) for p in pieces or []] or None)
    finally:
        video.unlink(missing_ok=True)  # la vidéo ne reste pas sur le service


def _url_fichier(analyse_id: str, dossier: Path, chemin: str | None) -> str | None:
    return f"/analyse/{analyse_id}/fichiers/{chemin}" if chemin and (dossier / chemin).exists() else None


def _pieces(analyse_id: str, dossier: Path, pieces: list[dict]) -> list[PieceEtat]:
    return [
        PieceEtat(nom=p["nom"], modele_3d_url=_url_fichier(analyse_id, dossier, p.get("modele_3d")),
                  image_annotee_url=_url_fichier(analyse_id, dossier, p.get("image_annotee")))
        for p in pieces
    ]


def _executer(analyse_id: str, requete: AnalyseRequete) -> None:
    etat = ANALYSES[analyse_id]
    sortie = DOSSIER_SORTIES / analyse_id
    try:
        resultat = calculer(str(requete.video_url), sortie, requete.logement_id, requete.piece, requete.pieces)
        etat.failles, etat.durees, etat.resultat = resultat["failles"], resultat["durees"], "pipeline"
        dossier, pieces = sortie, resultat.get("pieces") or []
    except VideoTropLourde as refus:  # demande refusée : on le dit, sans servir le plan B à la place
        etat.erreur, etat.etat = str(refus), "echec"
        return
    except Exception as erreur:  # quel que soit l'échec du calcul, la démo doit pouvoir continuer sur le plan B
        etat.erreur = f"{type(erreur).__name__} : {erreur}"
        if not (DOSSIER_PRECALCULE / "failles.json").exists():
            etat.etat = "echec"
            return
        contenu = json.loads((DOSSIER_PRECALCULE / "failles.json").read_text(encoding="utf-8"))
        etat.failles, etat.resultat = [Faille(**f) for f in contenu["failles"]], "precalcule"
        dossier, pieces = DOSSIER_PRECALCULE, contenu.get("pieces") or []
    etat.pieces = _pieces(analyse_id, dossier, pieces)
    etat.modele_3d_url = _url_fichier(analyse_id, dossier, "modele.glb")
    etat.image_annotee_url = _url_fichier(analyse_id, dossier, "image_annotee.jpg")
    etat.etat = "termine"


def appareil_de_calcul() -> str:
    """cuda, mps ou cpu : ce que torch voit sur cette machine."""
    from pipeline.analyse import choisir_appareil

    return choisir_appareil()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "plan_b": (DOSSIER_PRECALCULE / "failles.json").exists(), "appareil": appareil_de_calcul()}


@app.post("/analyse", response_model=AnalyseEtat, status_code=202, dependencies=[Depends(verifier_cle)])
def analyse(requete: AnalyseRequete) -> AnalyseEtat:
    """Vidéo du logement → failles avec leurs cotes, image annotée et modèle 3D. Asynchrone."""
    analyse_id = uuid.uuid4().hex
    ANALYSES[analyse_id] = AnalyseEtat(analyse_id=analyse_id, logement_id=requete.logement_id)
    reponse = ANALYSES[analyse_id].model_copy()
    _file_de_calcul.submit(_executer, analyse_id, requete)
    return reponse


@app.get("/analyse/{analyse_id}", response_model=AnalyseEtat, dependencies=[Depends(verifier_cle)])
def etat_analyse(analyse_id: str) -> AnalyseEtat:
    if analyse_id not in ANALYSES:
        raise HTTPException(status_code=404, detail="Analyse inconnue.")
    return ANALYSES[analyse_id]


@app.get("/analyse/{analyse_id}/fichiers/{chemin:path}", dependencies=[Depends(verifier_cle)])
def fichier_analyse(analyse_id: str, chemin: str) -> FileResponse:
    """Sert modele.glb, image_annotee.jpg ou failles.json, à la racine de l'analyse ou dans pieces/<pièce>/."""
    etat = ANALYSES.get(analyse_id)
    if etat is None or etat.etat != "termine" or Path(chemin).name not in FICHIERS_SERVIS:
        raise HTTPException(status_code=404, detail="Fichier inconnu.")
    dossier = (DOSSIER_PRECALCULE if etat.resultat == "precalcule" else DOSSIER_SORTIES / analyse_id).resolve()
    cible = (dossier / chemin).resolve()
    if not cible.is_relative_to(dossier) or not cible.is_file():
        raise HTTPException(status_code=404, detail="Fichier inconnu.")
    return FileResponse(cible)


def lancer_autotest() -> dict:
    from pipeline.autotest import lancer_autotest as autotest

    return autotest()


def exiger_cle_definie() -> None:
    """L'auto-test charge tous les modèles : il n'est ouvert que si le service a une clé (VISION_API_KEY)."""
    if not os.environ.get("VISION_API_KEY"):
        raise HTTPException(status_code=403, detail="Auto-test fermé : VISION_API_KEY n'est pas définie.")


def _executer_autotest(autotest_id: str) -> None:
    etat = AUTOTESTS[autotest_id]
    try:
        etat.resultat = lancer_autotest()
        etat.etat = "termine"
    except Exception as erreur:
        etat.erreur, etat.etat = f"{type(erreur).__name__} : {erreur}", "echec"


@app.post("/autotest", response_model=AutotestEtat, status_code=202,
          dependencies=[Depends(exiger_cle_definie), Depends(verifier_cle)])
def autotest() -> AutotestEtat:
    """Diagnostic : charge les quatre modèles et les fait tourner sur des images de synthèse. Asynchrone."""
    autotest_id = uuid.uuid4().hex
    AUTOTESTS[autotest_id] = AutotestEtat(autotest_id=autotest_id)
    reponse = AUTOTESTS[autotest_id].model_copy()
    _file_de_calcul.submit(_executer_autotest, autotest_id)
    return reponse


@app.get("/autotest/{autotest_id}", response_model=AutotestEtat,
         dependencies=[Depends(exiger_cle_definie), Depends(verifier_cle)])
def etat_autotest(autotest_id: str) -> AutotestEtat:
    if autotest_id not in AUTOTESTS:
        raise HTTPException(status_code=404, detail="Auto-test inconnu.")
    return AUTOTESTS[autotest_id]


@app.post("/contrat", response_model=StubReponse, status_code=501)
def contrat(requete: ContratRequete) -> StubReponse:
    """PDF du contrat → champs extraits, chacun avec sa clause et sa page."""
    return StubReponse(route="/contrat")
