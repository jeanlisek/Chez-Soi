"""Extraction des champs du contrat, chacun avec sa clause, sa page et sa citation.

Deux sources de candidats :
1. des règles déterministes (expressions régulières) sur le texte de chaque page : identification
   (assureur, formule, référence des conditions générales), inoccupation, mesures de prévention ;
2. un LLM (HF Inference Providers, si `HF_TOKEN` est défini), qui propose d'autres obligations
   au format Pydantic.

Puis une seule règle de tri, appliquée à tous : **une obligation dont la citation n'est pas retrouvée
mot pour mot (aux espaces et à la casse près) sur la page annoncée, ou sans clause ni page, est rejetée**
(règle non négociable du CLAUDE.md). Le LLM propose, le texte du PDF décide.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.request

from contrat.schema import ChampCite, Obligation, Page, Rejet, ResultatContrat

ASSUREURS = [
    "MAIF", "MACIF", "MATMUT", "MAAF", "GMF", "AXA", "Allianz", "Generali", "Groupama", "Crédit Agricole",
    "Pacifica", "BPCE", "LCL", "Société Générale", "Sogessur", "Direct Assurance", "Leocare", "Luko",
    "Lovys", "Altima", "Covéa", "MMA", "Swiss Life", "Aviva", "Abeille", "Thélem", "Groupama Gan", "Gan",
]

ELEMENTS = {
    "serrure": r"serrure|verrou|point(?:s)? de fermeture|3 points|trois points",
    "porte_entree": r"porte d['’]entr[ée]e|porte palière|porte blind[ée]e",
    "fenetre": r"fen[êe]tres?|volets?|persiennes?|baies? vitr[ée]es?|barreaux",
    "detecteur_fumee": r"d[ée]tecteurs? de fum[ée]e",
    "detecteur_co": r"monoxyde de carbone",
}


def normaliser(texte: str) -> str:
    """Minuscules, sans accents, apostrophes et espaces unifiés : pour retrouver une citation."""
    t = unicodedata.normalize("NFKD", texte)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = t.replace("’", "'").replace("‘", "'").replace("«", '"').replace("»", '"')
    t = re.sub(r"-\s*\n\s*", "", t)  # césures de fin de ligne
    return re.sub(r"\s+", " ", t).strip()


def citation_retrouvee(citation: str, page: Page | None) -> bool:
    return bool(page) and len(citation.strip()) >= 12 and normaliser(citation) in normaliser(page.texte)


TITRE = re.compile(
    r"^\s*((?:article|art\.|chapitre|clause|titre|section)\s+[\w.\-]+[^\n]{0,70}|\d+(?:\.\d+){0,3}[.)]?\s+[A-ZÉÈÀÂÎ][^\n]{2,70})\s*$",
    flags=re.IGNORECASE,
)


def phrases(texte: str) -> list[str]:
    """Phrases du texte : les titres d'articles sont mis à part, les lignes coupées sont recollées."""
    blocs: list[str] = []
    courant: list[str] = []
    for ligne in texte.splitlines():
        l = ligne.strip()
        if not l or TITRE.match(l):
            if courant:
                blocs.append(" ".join(courant))
            courant = []
            continue
        courant.append(l)
        if re.search(r"[.;!?]$", l):
            blocs.append(" ".join(courant))
            courant = []
    if courant:
        blocs.append(" ".join(courant))
    sortie: list[str] = []
    for b in blocs:
        sortie += [m.strip() for m in re.split(r"(?<=[.;!?])\s+", b) if len(m.strip()) > 20]
    return sortie


def clause_proche(page: Page, citation: str) -> str | None:
    """Titre d'article ou de clause qui précède la citation sur la page (« Article 12 », « 4.2 Vol »…)."""
    lignes = page.texte.splitlines()
    debut = normaliser(citation)[:30]
    position = next((i for i, l in enumerate(lignes) if debut[:20] and debut[:20] in normaliser(l)), len(lignes))
    for ligne in reversed(lignes[: position + 1]):
        m = TITRE.match(ligne)
        if m and normaliser(m.group(1))[:20] != debut[:20]:
            return m.group(1).strip()
    return None


# ---------- 1. Règles déterministes ----------


def champs_identification(pages: list[Page]) -> dict[str, ChampCite]:
    champs: dict[str, ChampCite] = {}
    for p in pages:
        texte = p.texte
        if "assureur" not in champs:
            m = re.search(r"(?i:assureur)[ \t]*:[ \t]*([A-ZÉ][\w’' \-]{1,40}?)[ \t]*(?:\n|,|\.|$)", texte)
            if m:
                champs["assureur"] = ChampCite(valeur=m.group(1).strip(), page=p.numero, citation=m.group(0).strip())
        if "assureur" not in champs:
            for nom in ASSUREURS:
                m = re.search(rf"\b{re.escape(nom)}\b", texte)
                if m:
                    ligne = texte[max(0, m.start() - 60) : m.end() + 60].replace("\n", " ").strip()
                    champs["assureur"] = ChampCite(valeur=nom, page=p.numero, citation=ligne)
                    break
        if "formule" not in champs:
            m = re.search(r"(?i:formule|offre)[ \t]*:[ \t]*[«\"]?[ \t]*([A-Z][\w’' \-]{2,40}?)[ \t]*[»\"]?[ \t]*(?:\n|,|\.|$)", texte)
            if m and len(m.group(1).split()) <= 5:
                champs["formule"] = ChampCite(valeur=m.group(1).strip(), page=p.numero, citation=m.group(0).strip())
        if "reference_cg" not in champs:
            m = re.search(
                r"(?:conditions g[ée]n[ée]rales|CG)[^\n]{0,60}?(?:r[ée]f(?:[ée]rence)?\.?|n[°o])\s*:?\s*([A-Z]{0,4}[\-\s]?\d{3,6}(?:[\-_/][\w]{1,8})?)",
                texte,
                flags=re.IGNORECASE,
            ) or re.search(r"\b([A-Z]{1,3}\d{4})\s*[-–]\s*\d{2}/\d{4}\b", texte)
            if m:
                champs["reference_cg"] = ChampCite(valeur=m.group(1).strip(), page=p.numero, citation=m.group(0).strip())
    return champs


def obligations_par_regles(pages: list[Page]) -> list[Obligation]:
    trouvees: list[Obligation] = []
    for p in pages:
        for ph in phrases(p.texte):
            n = normaliser(ph)
            # Inoccupation : « inoccupé plus de 30 jours consécutifs », « absence de plus de 90 jours »…
            if re.search(r"inoccup|absen|non habit|vacant", n):
                m = re.search(r"(\d{1,3})\s*(jours|jour|mois)", n)
                if m:
                    valeur = int(m.group(1)) * (30 if m.group(2).startswith("mois") else 1)
                    if 7 <= valeur <= 365:
                        trouvees.append(
                            Obligation(
                                type="inoccupation",
                                element="inoccupation",
                                seuil=valeur,
                                unite="jours",
                                texte_court=f"Inoccupation au-delà de {valeur} jours",
                                citation=ph,
                                clause=clause_proche(p, ph),
                                page=p.numero,
                            )
                        )
                        continue
            # Prévention contre le vol : obligations de fermeture, serrures, volets. Les conditions particulières
            # décrivent aussi les moyens de protection sans mot d'obligation (« est équipée d'une serrure… »).
            if re.search(r"(vous devez|doivent|est exig|obligatoire|condition de garantie|sous peine|a defaut|est equipe|sont equipe)", n):
                for element, motif in ELEMENTS.items():
                    if re.search(motif, n, flags=re.IGNORECASE):
                        trouvees.append(
                            Obligation(
                                type="prevention",
                                element=element,
                                texte_court=ph[:140],
                                citation=ph,
                                clause=clause_proche(p, ph),
                                page=p.numero,
                            )
                        )
                        break
    return trouvees


# ---------- 2. LLM (facultatif) ----------

CONSIGNE = """Tu lis un contrat d'assurance habitation français, page par page.
Rends UNIQUEMENT un objet JSON : {"obligations": [ {"type": "prevention|inoccupation|exclusion|garantie|franchise|plafond",
"element": un code parmi [serrure, porte_entree, fenetre, detecteur_fumee, detecteur_co, inoccupation, barre_appui, eclairage, escalier] ou null,
"seuil": nombre ou null, "unite": "jours" | "euros" | null, "texte_court": "≤ 120 caractères, en français",
"citation": "phrase COPIÉE MOT POUR MOT du texte", "clause": "titre ou numéro de l'article", "page": numéro de page} ] }.
N'invente rien : une obligation sans citation exacte sera rejetée. 12 obligations au plus, les plus utiles
à la sécurité du logement (vol, inoccupation, prévention des chutes et des incendies)."""


def obligations_par_llm(pages: list[Page]) -> list[Obligation]:
    jeton = os.environ.get("HF_TOKEN")
    if not jeton:
        return []
    modele = os.environ.get("CONTRAT_LLM_MODELE", "Qwen/Qwen2.5-72B-Instruct")
    texte = "\n\n".join(f"=== PAGE {p.numero} ===\n{p.texte}" for p in pages)[:90_000]
    corps = json.dumps(
        {
            "model": modele,
            "messages": [{"role": "system", "content": CONSIGNE}, {"role": "user", "content": texte}],
            "temperature": 0,
            "max_tokens": 3000,
            "response_format": {"type": "json_object"},
        }
    ).encode()
    requete = urllib.request.Request(
        "https://router.huggingface.co/v1/chat/completions",
        data=corps,
        headers={"Authorization": f"Bearer {jeton}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(requete, timeout=120) as r:
            contenu = json.loads(r.read())["choices"][0]["message"]["content"]
        brut = json.loads(contenu[contenu.find("{") : contenu.rfind("}") + 1])
    except Exception:
        return []
    sorties: list[Obligation] = []
    for o in brut.get("obligations", [])[:12]:
        try:
            sorties.append(Obligation(**o, origine="llm"))
        except Exception:
            continue
    return sorties


# ---------- Tri : la citation doit être dans le PDF ----------


def trier(candidats: list[Obligation], pages: list[Page]) -> tuple[list[Obligation], list[Rejet]]:
    par_numero = {p.numero: p for p in pages}
    retenues: list[Obligation] = []
    rejets: list[Rejet] = []
    vues: set[tuple] = set()
    for o in candidats:
        if not o.page or not o.clause:
            # Sans clause : on tente de la retrouver sur la page, sinon rejet.
            if o.page and par_numero.get(o.page):
                o.clause = clause_proche(par_numero[o.page], o.citation)
            if not o.page or not o.clause:
                rejets.append(Rejet(texte_court=o.texte_court, raison="clause ou page introuvable"))
                continue
        page = par_numero.get(o.page)
        if not citation_retrouvee(o.citation, page):
            rejets.append(Rejet(texte_court=o.texte_court, raison=f"citation absente de la page {o.page}"))
            continue
        cle = (o.type, o.element, o.page, normaliser(o.citation)[:80])
        if cle in vues:
            continue
        vues.add(cle)
        o.citation_retrouvee = True
        retenues.append(o)
    return retenues, rejets


def extraire(contrat_id: str, pages: list[Page], moteur: str) -> ResultatContrat:
    champs = champs_identification(pages)
    candidats_llm = obligations_par_llm(pages)
    retenues, rejets = trier(obligations_par_regles(pages) + candidats_llm, pages)
    return ResultatContrat(
        contrat_id=contrat_id,
        statut="ok" if retenues or champs else "vide",
        assureur=champs["assureur"].valeur if "assureur" in champs else None,
        formule=champs["formule"].valeur if "formule" in champs else None,
        reference_cg=champs["reference_cg"].valeur if "reference_cg" in champs else None,
        champs=champs,
        obligations=retenues,
        clauses_rejetees=rejets,
        pages=len(pages),
        moteur="docling" if moteur == "docling" else "pypdf",
        llm=bool(candidats_llm),
    )
