"""Route `POST /contrat` du service vision : PDF du contrat → champs extraits avec clause et page.

Synchrone : le workflow n8n `analyse_contrat` attend la réponse 200 pour écrire `obligations_contrat`
et le graphe (nœuds Clause, arêtes IMPOSE). Le PDF est lu puis effacé ; il ne quitte jamais le service.
"""

from __future__ import annotations

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException

from contrat.extraction import extraire
from contrat.lecture import ContratIllisible, lire_url
from contrat.schema import ContratRequete, ResultatContrat

router = APIRouter(tags=["contrat"])


def verifier_cle(x_vision_key: str | None = Header(default=None)) -> None:
    """Si VISION_API_KEY est définie, l'appel doit la présenter dans l'en-tête X-Vision-Key."""
    cle = os.environ.get("VISION_API_KEY")
    if cle and not secrets.compare_digest((x_vision_key or "").encode(), cle.encode()):
        raise HTTPException(status_code=401, detail="Clé du service vision absente ou invalide.")


@router.post("/contrat", response_model=ResultatContrat, dependencies=[Depends(verifier_cle)])
def contrat(requete: ContratRequete) -> ResultatContrat:
    """PDF du contrat → assureur, formule, référence des CG et obligations, chacune citée avec sa page."""
    try:
        pages, moteur, repli = lire_url(requete.pdf_url)
    except ContratIllisible as refus:
        raise HTTPException(status_code=422, detail=str(refus)) from refus
    except Exception as erreur:
        raise HTTPException(status_code=502, detail=f"PDF injoignable : {type(erreur).__name__}") from erreur
    return extraire(requete.contrat_id, pages, moteur, repli)
