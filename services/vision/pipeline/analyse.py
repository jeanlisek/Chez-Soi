"""Enchaînement complet : images → détection → points 3D métriques → cotes → failles.json, image annotée, .glb."""

import functools
import json
import re
import shutil
import time
import unicodedata
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .cotes import agreger_cotes, dimensions_frontales, dimensions_sur_le_mur, rectangle_au_sol
from .detection import SEUIL_COTES, SEUIL_PRESENCE, TERME_REFERENCE, TERMES_COTES, TERMES_PRESENCE, touche_le_bord
from .export import (
    Faille, annoter_image, ecrire_failles, exporter_glb, libelle_cote, libelle_partiel, relief_texture, vers_repere_glb,
)
from .frames import extraire_images
from .reconstruction import centre_dans_la_vue, nuage_fusionne

REFERENCE = "feuille_a4"
A4_CM = (21.0, 29.7)
AU_SOL = {"tapis", REFERENCE}
FRONTAUX = {"porte", "fenetre"}
COTE_PRINCIPALE = {"tapis": "longueur_cm", "porte": "largeur_cm", "fenetre": "largeur_cm"}
# Bornes de vraisemblance en cm : au-delà, la détection est presque sûrement fausse (miroir, pan de mur, reflet).
BORNES_CM = {
    "tapis": {"largeur_cm": (30, 400), "longueur_cm": (40, 600)},
    "porte": {"largeur_cm": (50, 130), "hauteur_cm": (150, 260)},
    "fenetre": {"largeur_cm": (30, 400), "hauteur_cm": (30, 300)},
}
_DIMENSIONS = ("largeur_cm", "longueur_cm", "hauteur_cm")
_MIN_POINTS = 400
LARGEUR_IMAGE_ANNOTEE = 1080
LARGEUR_VIGNETTE = 720  # une vignette par point dans la planche `image_annotee.jpg`
NB_VIGNETTES_MAX = 24
NB_RELIEFS_MAX = 12  # surfaces texturées dans modele.glb (environ 1,5 Mo chacune)


MESSAGES_A_CONFIRMER = {
    "hors_cadre": "Cote à confirmer par l'utilisateur : l'objet est coupé par le cadre dans toutes les vues.",
    "non_mesurable": "Cote à confirmer par l'utilisateur : l'objet n'a pas pu être mesuré.",
}


@dataclass(frozen=True)
class Piece:
    """Segment de la vidéo qui montre une pièce. Une pièce peut avoir plusieurs segments (même nom)."""

    nom: str
    debut_s: float
    fin_s: float


def regrouper_pieces(pieces: list[Piece]) -> dict[str, list[tuple[float, float]]]:
    """Réunit les segments qui portent le même nom (sans tenir compte de la casse), dans l'ordre de la vidéo."""
    segments: dict[str, list[tuple[float, float]]] = {}
    noms: dict[str, str] = {}
    for piece in sorted(pieces, key=lambda p: p.debut_s):
        nom = noms.setdefault(piece.nom.strip().lower(), piece.nom.strip())
        segments.setdefault(nom, []).append((piece.debut_s, piece.fin_s))
    return segments


def dossier_piece(nom: str) -> str:
    sans_accent = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", sans_accent.lower()).strip("_")


@dataclass
class MesureVue:
    """Ce qu'une image dit d'un élément : sa position et, si l'élément se mesure, ses cotes en cm."""

    element: str
    risque: str
    image: str
    score: float
    boite_px: tuple[int, int, int, int]
    centre: tuple[float, float, float] | None
    largeur_cm: float | None = None
    longueur_cm: float | None = None
    hauteur_cm: float | None = None
    coupe: bool = False  # l'élément est coupé par le bord de l'image : ses cotes ne valent que pour la partie visible
    instance: int = 0  # numéro de l'objet parmi ceux du même type (0 sans reconstruction)
    centre_monde: tuple[float, float, float] | None = None  # position dans le repère commun de la reconstruction


def plausible(mesure: MesureVue) -> bool:
    """Écarte une vue entière dont les cotes sortent des bornes de vraisemblance de son type d'élément."""
    if mesure.coupe:
        # Partie visible : elle ne dépasse pas la taille maximale du type, et il en reste assez pour être utile.
        visibles = {d: getattr(mesure, d) for d in BORNES_CM.get(mesure.element, {}) if getattr(mesure, d) is not None}
        if not visibles:
            return True
        return max(visibles.values()) >= 40 and all(v <= BORNES_CM[mesure.element][d][1] for d, v in visibles.items())
    for dimension, (mini, maxi) in BORNES_CM.get(mesure.element, {}).items():
        valeur = getattr(mesure, dimension)
        if valeur is not None and not mini <= valeur <= maxi:
            return False
    return True


def suivre_instances(vues: list[tuple[int, str]], ecart_max: int = 3) -> list[int]:
    """Numérote les objets distincts d'un même type en suivant la vidéo.

    `vues` liste, dans l'ordre, (numéro de l'image, élément). Un objet reste le même tant qu'on le revoit à
    `ecart_max` images d'écart au plus ; deux objets du même type dans la même image sont distincts.
    """
    pistes: dict[str, list[dict]] = defaultdict(list)
    numeros = []
    for image, element in vues:
        libres = [p for p in pistes[element] if p["derniere"] != image and image - p["derniere"] <= ecart_max]
        if libres:
            piste = max(libres, key=lambda p: (p["derniere"], -p["numero"]))
        else:
            piste = {"numero": len(pistes[element])}
            pistes[element].append(piste)
        piste["derniere"] = image
        numeros.append(piste["numero"])
    return numeros


# Deux objets du même type à moins de cette distance (m) dans le modèle sont le même objet, revu plus tard.
RAYON_MEME_OBJET_M = {"tapis": 0.5, "porte": 0.6, "fenetre": 0.6}
TOLERANCE_MEME_OBJET = 1.3  # une vue d'un objet ne montre pas 30 % de plus que cet objet vu en entier
# Éléments qui se mesurent : vus dans une seule image d'une vidéo, ce sont le plus souvent de fausses détections.
ELEMENTS_A_CONFIRMER_PAR_DEUX_VUES = {"tapis", "porte", "fenetre"}
NB_IMAGES_MIN_POUR_EXIGER_DEUX_VUES = 8


def _tailles_compatibles(a: list[MesureVue], b: list[MesureVue]) -> bool:
    """Deux instances proches ne sont le même objet que si aucune ne dépasse nettement l'autre vue en entier.

    Mesuré le 19/11 : le parquet de l'entrée, pris pour un tapis (88 cm visibles), absorbait le vrai paillasson
    (40 × 61 cm, vu en entier) placé juste à côté, et sa cote disparaissait.
    """
    for entier, autre in ((a, b), (b, a)):
        for dimension in _DIMENSIONS:
            reference = [getattr(v, dimension) for v in entier if not v.coupe and getattr(v, dimension) is not None]
            if not reference:
                continue
            if any((getattr(v, dimension) or 0) > TOLERANCE_MEME_OBJET * max(reference) for v in autre):
                return False
    return True


def fusionner_instances_proches(mesures: list[MesureVue]) -> None:
    """Réunit les instances d'un même type dont les centres sont proches dans le repère commun.

    `suivre_instances` sépare les objets par continuité dans la vidéo : un tapis revu dix images plus tard
    devenait un second tapis. Ici la position 3D tranche. Sans `centre_monde`, rien ne change.
    """
    centres: dict[tuple[str, int], np.ndarray] = {}
    for cle in {(m.element, m.instance) for m in mesures}:
        vus = [m.centre_monde for m in mesures if (m.element, m.instance) == cle and m.centre_monde is not None]
        if vus:
            centres[cle] = np.median(np.asarray(vus, float), axis=0)
    cible = {cle: cle[1] for cle in centres}
    vues: dict[tuple[str, int], list[MesureVue]] = defaultdict(list)
    for mesure in mesures:
        vues[(mesure.element, mesure.instance)].append(mesure)
    for element, rayon in RAYON_MEME_OBJET_M.items():
        instances = sorted(i for e, i in centres if e == element)
        for a in instances:
            for b in instances:
                proches = np.linalg.norm(centres[(element, a)] - centres[(element, b)]) <= rayon
                # Deux objets visibles dans la même image sont forcément distincts (deux fenêtres côte à côte).
                ensemble = {v.image for v in vues[(element, a)]} & {v.image for v in vues[(element, b)]}
                if a < b and cible[(element, b)] == b and proches and not ensemble and _tailles_compatibles(vues[(element, a)], vues[(element, b)]):
                    cible[(element, b)] = cible[(element, a)]
    for mesure in mesures:
        mesure.instance = cible.get((mesure.element, mesure.instance), mesure.instance)


def ecarter_vues_uniques(mesures: list[MesureVue], nb_images: int) -> list[MesureVue]:
    """Sur une vidéo, retire les éléments mesurables vus dans une seule image ET coupés par le cadre.

    Un élément vu une seule fois mais en entier est gardé : sur les vidéos réelles, le regroupement entre
    images échoue souvent et de vrais éléments (une fenêtre filmée de face) n'ont qu'une vue.
    """
    if nb_images < NB_IMAGES_MIN_POUR_EXIGER_DEUX_VUES:
        return mesures
    vues: dict[tuple[str, int], set[str]] = defaultdict(set)
    entieres: set[tuple[str, int]] = set()
    for mesure in mesures:
        vues[(mesure.element, mesure.instance)].add(mesure.image)
        if not mesure.coupe:
            entieres.add((mesure.element, mesure.instance))
    return [
        m for m in mesures
        if m.element not in ELEMENTS_A_CONFIRMER_PAR_DEUX_VUES
        or len(vues[(m.element, m.instance)]) >= 2
        or (m.element, m.instance) in entieres
    ]


def ecarter_failles_tapis_jamais_entieres(failles: list) -> list:
    """Même règle, sur les failles : `nb_vues_entieres` compte les vues entières après le retrait des vues
    masquées, ce que la règle sur les mesures ne voit pas. Sur l'Entrée de test, le parquet (10 vues) gardait
    une vue « entière » masquée par ses vues coupées et passait la première règle.
    """
    entieres = [f for f in failles if f.element == "tapis" and f.position_3d.get("nb_vues_entieres", 0) > 0]
    if not entieres:
        return failles
    return [f for f in failles if f.element != "tapis" or f.position_3d.get("nb_vues_entieres", 0) > 0]


def ecarter_tapis_jamais_entiers(mesures: list[MesureVue]) -> list[MesureVue]:
    """Quand un tapis de la pièce a été vu en entier, retire les « tapis » toujours coupés par le cadre.

    Sur les vidéos réelles, le sol (parquet, carrelage) pris en bord d'image ressort comme un tapis jamais vu
    en entier, à côté du vrai tapis mesuré : chacun devenait un point et une action à part. Sans tapis vu en
    entier dans la pièce, on garde tout : la cote reste alors à confirmer par l'utilisateur.
    """
    entiers = {m.instance for m in mesures if m.element == "tapis" and not m.coupe}
    if not entiers:
        return mesures
    return [m for m in mesures if m.element != "tapis" or m.instance in entiers]


def _masquees(entieres: list[MesureVue], coupees: list[MesureVue]) -> list[MesureVue]:
    """Vues « entières » en réalité masquées par un obstacle : une vue coupée du même objet en montre davantage."""
    return [
        e for e in entieres
        if any((getattr(c, d) or 0) > 1.15 * getattr(e, d) for c in coupees for d in _DIMENSIONS if getattr(e, d))
    ]


def facteur_echelle_a4(mesures: list[MesureVue]) -> float | None:
    """Facteur à appliquer aux cotes pour que la feuille A4 vue dans la vidéo mesure bien 21 × 29,7 cm."""
    facteurs = []
    for m in mesures:
        if m.element != REFERENCE or m.coupe or not m.largeur_cm or not m.longueur_cm:
            continue
        proportion = m.longueur_cm / m.largeur_cm
        if 1.25 <= proportion <= 1.6 and 15 <= m.longueur_cm <= 45:
            facteurs.append((A4_CM[0] / m.largeur_cm + A4_CM[1] / m.longueur_cm) / 2)
    return float(np.median(facteurs)) if facteurs else None


def construire_failles(mesures: list[MesureVue], piece: str | None, facteur: float = 1.0) -> list[Faille]:
    """Regroupe les vues par objet : cote = médiane entre les vues entières, marge = dispersion de la cote principale."""
    par_objet: dict[tuple[str, int], list[MesureVue]] = defaultdict(list)
    for mesure in mesures:
        if mesure.element != REFERENCE:
            par_objet[(mesure.element, mesure.instance)].append(mesure)

    failles = []
    for (element, instance), vues in par_objet.items():
        coupees = [v for v in vues if v.coupe]
        masquees = _masquees([v for v in vues if not v.coupe], coupees)
        entieres = [v for v in vues if not v.coupe and v not in masquees]
        vues = entieres + coupees
        cotes: dict[str, float | None] = {}
        marges: dict[str, float | None] = {}
        for dimension in _DIMENSIONS:
            valeurs = [getattr(v, dimension) * facteur for v in entieres if getattr(v, dimension) is not None]
            cote, marge = agreger_cotes(valeurs) if valeurs else (None, None)
            cotes[dimension] = None if cote is None else round(cote, 1)
            marges[dimension] = marge
        principale = COTE_PRINCIPALE.get(element)
        # `cote.statut` dit à l'écran du plan quoi afficher : une cote estimée, une cote à faire confirmer
        # par l'utilisateur (jamais écrite dans cote_estimee_cm), ou rien pour un élément qui ne se mesure pas.
        if principale and cotes[principale] is not None:
            mesurees = [v for v in entieres if getattr(v, principale) is not None]
            cle = min(mesurees, key=lambda v: abs(getattr(v, principale) * facteur - cotes[principale]))
            cote: dict = {"statut": "estimee"}
        elif principale and any(getattr(v, principale) is not None for v in vues):
            # Jamais vu en entier : pas de cote, mais on garde la plus grande partie visible comme indication.
            cle = max((v for v in vues if getattr(v, principale) is not None), key=lambda v: getattr(v, principale))
            visible = {d: round(getattr(cle, d) * facteur, 1) for d in _DIMENSIONS if getattr(cle, d) is not None}
            cote = {"statut": "a_confirmer", "raison": "hors_cadre", "partie_visible_cm": visible,
                    "message": MESSAGES_A_CONFIRMER["hors_cadre"]}
        else:
            cle = max(vues, key=lambda v: v.score)
            cote = (
                {"statut": "a_confirmer", "raison": "non_mesurable", "message": MESSAGES_A_CONFIRMER["non_mesurable"]}
                if principale else {"statut": "sans_objet"}
            )
        centre = cle.centre_monde if cle.centre_monde is not None else cle.centre
        failles.append(Faille(
            element=element, piece=piece, risque=cle.risque,
            origine="pipeline" if cote["statut"] == "estimee" else None,
            cote_estimee_cm=cotes[principale] if principale else None,
            marge_cm=marges[principale] if principale else None,
            **cotes,
            position_3d={
                "centre": None if centre is None else [round(float(c), 3) for c in vers_repere_glb(np.asarray(centre) * facteur)],
                "repere": "modele.glb" if cle.centre_monde is not None else f"camera:{cle.image}",
                "instance": instance,
                "image_cle": cle.image,
                "boite_px": list(cle.boite_px),
                "nb_vues": len(vues) + len(masquees),
                "nb_vues_entieres": len(entieres),
                "cote": cote,
            },
        ))
    return failles


def planche_par_point(failles: list, vues: dict[str, dict], libelle) -> np.ndarray | None:
    """Une vignette par point, empilées de haut en bas : l'image clé du point, avec ce seul élément encadré.

    L'image annotée unique montrait une seule vue de la pièce : la page d'un tapis pouvait afficher la fenêtre.
    Chaque faille reçoit `position_3d["vignette"]` (index, total, largeur, hauteur, boite) : l'app affiche sa tranche.
    Un seul fichier, pour que la copie vers le stockage (n8n) ne change pas. None s'il n'y a rien à montrer.
    """
    vignettes: list[np.ndarray] = []
    servies: list = []
    boites: list[list[float]] = []
    taille: tuple[int, int] | None = None
    for faille in failles:
        vue = vues.get(faille.position_3d.get("image_cle"))
        if vue is None:
            continue
        instance = faille.position_3d.get("instance")
        detection = next(
            (d for d, m in zip(vue["detections"], vue["mesures"]) if m.element == faille.element and m.instance == instance),
            None,
        )
        image = cv2.imread(str(vue["chemin"]))
        if detection is None or image is None:
            continue
        annotee = annoter_image(
            image, [{"libelle": libelle(faille), "boite_px": detection.boite_px, "masque": detection.masque}], LARGEUR_IMAGE_ANNOTEE
        )
        if taille is None:
            taille = (LARGEUR_VIGNETTE, round(annotee.shape[0] * LARGEUR_VIGNETTE / annotee.shape[1]))
        vignettes.append(cv2.resize(annotee, taille, interpolation=cv2.INTER_AREA))
        hauteur, largeur = image.shape[:2]
        x1, y1, x2, y2 = detection.boite_px
        # Boîte en fractions de la vignette : l'app cadre l'affichage sur l'élément.
        boites.append([round(x1 / largeur, 4), round(y1 / hauteur, 4), round(x2 / largeur, 4), round(y2 / hauteur, 4)])
        servies.append(faille)
        if len(vignettes) == NB_VIGNETTES_MAX:
            break
    if not vignettes or taille is None:
        return None
    for index, faille in enumerate(servies):
        faille.position_3d["vignette"] = {
            "index": index, "total": len(servies), "largeur": taille[0], "hauteur": taille[1], "boite": boites[index],
        }
    return np.vstack(vignettes)


def reliefs_par_vue_cle(failles: list, vues: dict[str, dict], reconstruit, indices: dict[str, int], facteur: float) -> dict:
    """Une « photo en relief » par image clé (voir `relief_texture`), dans le repère commun du modèle.

    Chaque faille reçoit `position_3d["relief"]` : le nœud du .glb à afficher, la position de la caméra qui a filmé
    et le point à regarder. L'app ouvre la 3D depuis cette caméra, là où la vue ressemble à la photo.
    """
    reliefs: dict = {}
    for faille in failles:
        nom = faille.position_3d.get("image_cle")
        if nom not in indices or nom not in vues or faille.position_3d.get("repere") != "modele.glb":
            continue
        i = indices[nom]
        noeud = f"vue_{i:03d}"
        if noeud not in reliefs:
            if len(reliefs) >= NB_RELIEFS_MAX:
                continue
            image = cv2.imread(str(vues[nom]["chemin"]))
            texture = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) if image is not None else reconstruit.couleurs[i]
            # La photo d'origine n'est la bonne texture que si elle a les proportions de la carte de points.
            h, w = reconstruit.points[i].shape[:2]
            if abs(texture.shape[0] / texture.shape[1] - h / w) > 0.02 * h / w:
                texture = reconstruit.couleurs[i]
            relief = relief_texture(vers_repere_glb(reconstruit.points[i] * facteur), np.ascontiguousarray(texture))
            if relief is None:
                continue
            reliefs[noeud] = relief
        camera = vers_repere_glb(reconstruit.poses[i][:3, 3] * facteur)
        faille.position_3d["relief"] = {
            "noeud": noeud,
            "camera": [round(float(c), 3) for c in camera],
            "cible": faille.position_3d["centre"],
        }
    return reliefs


def choisir_vue_de_reference(vues: dict[str, list[tuple[str, bool, int]]]) -> str:
    """Vue montrée dans l'image annotée : le tapis avec une cote, le plus de types d'éléments, puis les plus grands.

    `vues` donne, par image, (élément, cote estimée ?, aire de la boîte en pixels) pour chaque faille visible.
    """
    def interet(nom: str) -> tuple:
        elements = vues[nom]
        tapis = any(e == "tapis" for e, _, _ in elements)
        cotee = any(c for _, c, _ in elements)
        return (tapis and cotee, tapis or cotee, len({e for e, _, _ in elements}), sum(a for _, _, a in elements))

    return max(vues, key=interet)


def _libelle(faille: Faille) -> str:
    cote = faille.position_3d["cote"]
    if cote["statut"] == "a_confirmer":
        return libelle_partiel(faille.element, cote.get("partie_visible_cm"))
    return libelle_cote(faille.element, faille.largeur_cm, faille.longueur_cm, faille.hauteur_cm)


def _zone(detection, forme: tuple[int, int]) -> np.ndarray:
    if detection.masque is not None:
        return detection.masque
    x1, y1, x2, y2 = detection.boite_px
    zone = np.zeros(forme, bool)
    zone[y1:y2, x1:x2] = True
    return zone


def _mesurer(detection, points: np.ndarray, image: str, largeur: int, hauteur: int) -> MesureVue:
    zone = _zone(detection, points.shape[:2])
    nuage = points[zone]
    nuage = nuage[np.isfinite(nuage).all(axis=1)]
    mesure = MesureVue(
        detection.element, detection.risque, image, detection.score, detection.boite_px,
        centre=tuple(np.median(nuage, axis=0)) if len(nuage) else None,
        coupe=touche_le_bord(detection.boite_px, largeur, hauteur),
    )
    if len(nuage) < _MIN_POINTS:
        return mesure
    if detection.element in AU_SOL:
        rectangle = rectangle_au_sol(nuage)
        mesure.centre = rectangle.centre
        mesure.largeur_cm, mesure.longueur_cm = rectangle.largeur_m * 100, rectangle.longueur_m * 100
    elif detection.element == "fenetre":
        # Une fenêtre se mesure sur le plan du mur qui l'entoure : à travers la vitre, les points 3D sont dehors.
        x1, y1, x2, y2 = detection.boite_px
        epaisseur = max(8, int(0.08 * max(x2 - x1, y2 - y1)))
        large = cv2.dilate(zone.astype(np.uint8), np.ones((2 * epaisseur + 1,) * 2, np.uint8)).astype(bool)
        proche = cv2.dilate(zone.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        try:
            largeur_m, hauteur_m = dimensions_sur_le_mur(nuage, points[large & ~proche])
        except ValueError:
            largeur_m, hauteur_m = dimensions_frontales(nuage)
        mesure.largeur_cm, mesure.hauteur_cm = largeur_m * 100, hauteur_m * 100
    elif detection.element in FRONTAUX:
        largeur_m, hauteur_m = dimensions_frontales(nuage)
        mesure.largeur_cm, mesure.hauteur_cm = largeur_m * 100, hauteur_m * 100
    return mesure


@functools.lru_cache(maxsize=1)
def charger_reconstructeur(appareil: str):
    from .reconstruction import Reconstructeur

    return Reconstructeur(appareil)


@functools.lru_cache(maxsize=1)
def charger_modeles(appareil: str):
    """Les modèles sont chargés une seule fois par processus (le service les garde entre deux analyses)."""
    from .detection import Detecteur
    from .profondeur import ProfondeurMetrique

    return Detecteur(appareil), ProfondeurMetrique(appareil)


@functools.lru_cache(maxsize=1)
def charger_verificateur(appareil: str):
    from .verification import Verificateur

    return Verificateur(appareil)


def choisir_appareil() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    return "mps" if torch.backends.mps.is_available() else "cpu"


def verifier_avec_siglip(failles: list, mesures: list, vues: dict, appareil: str) -> tuple[list, list, str | None]:
    """Vérification par SigLIP. Si le modèle ne se charge pas, tous les points sont gardés, avec un avertissement."""
    from .verification import verifier_failles

    try:
        verificateur = charger_verificateur(appareil)
    except Exception as erreur:
        return failles, [], f"Vérification des points impossible ({type(erreur).__name__} : {erreur})."

    @functools.lru_cache(maxsize=8)
    def images_rvb(nom: str):
        bgr = cv2.imread(str(vues[nom]["chemin"])) if nom in vues else None
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB) if bgr is not None else None

    gardees, retirees = verifier_failles(failles, mesures, images_rvb, verificateur)
    return gardees, retirees, None


def analyser_images(
    images: list[Path], sortie: Path, logement_id: str, piece: str | None = None, calibrer_a4: bool = False,
    reconstruction: bool = False, presence: bool = False, verification: bool = False,
) -> dict:
    """Analyse des images déjà extraites. Écrit failles.json, vues.json, modele.glb, image_annotee.jpg et annotations/."""
    durees: dict[str, float] = {}
    debut = time.perf_counter()
    appareil = choisir_appareil()
    detecteur, profondeur = charger_modeles(appareil)
    durees["chargement_modeles_s"] = time.perf_counter() - debut

    mesures: list[MesureVue] = []
    vues: dict[str, dict] = {}
    durees.update(detection_s=0.0, contours_s=0.0, profondeur_s=0.0)
    termes = TERMES_COTES + ([TERME_REFERENCE] if calibrer_a4 else [])
    for chemin in images:
        bgr = cv2.imread(str(chemin))
        rvb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        hauteur, largeur = rvb.shape[:2]
        t = time.perf_counter()
        detections = detecteur.detecter(rvb, termes, SEUIL_COTES)
        if presence:
            detections += detecteur.detecter(rvb, TERMES_PRESENCE, SEUIL_PRESENCE)
        durees["detection_s"] += time.perf_counter() - t
        if not detections:
            continue
        t = time.perf_counter()
        detecteur.ajouter_masques(rvb, [d for d in detections if d.element in AU_SOL | FRONTAUX])
        durees["contours_s"] += time.perf_counter() - t
        t = time.perf_counter()
        points = profondeur.points(rvb)
        durees["profondeur_s"] += time.perf_counter() - t
        gardees = [(d, m) for d in detections if plausible(m := _mesurer(d, points, chemin.name, largeur, hauteur))]
        if not gardees:
            continue
        mesures.extend(m for _, m in gardees)
        vues[chemin.name] = {"chemin": chemin, "detections": [d for d, _ in gardees],
                             "mesures": [m for _, m in gardees], "points": points}

    # Un objet revu d'une image à la suivante reste le même objet : c'est ce qui sépare deux portes ou deux tapis.
    numeros_image = {chemin.name: i for i, chemin in enumerate(images)}
    for mesure, numero in zip(mesures, suivre_instances([(numeros_image[m.image], m.element) for m in mesures])):
        mesure.instance = numero

    # Reconstruction multi-vues : position de chaque élément dans un repère commun et modèle 3D de tout le logement.
    reconstruit, avertissements = None, []
    if reconstruction and vues:
        t = time.perf_counter()
        try:
            reconstruit = charger_reconstructeur(appareil).reconstruire(images)
        except Exception as erreur:  # la reconstruction est un plus : sans elle, on garde le résultat vue par vue
            avertissements.append(f"Reconstruction multi-vues impossible ({type(erreur).__name__} : {erreur}).")
        durees["reconstruction_s"] = time.perf_counter() - t
    if reconstruit is not None:
        indices = {chemin.name: i for i, chemin in enumerate(images)}
        for nom, vue in vues.items():
            for detection, mesure in zip(vue["detections"], vue["mesures"]):
                mesure.centre_monde = centre_dans_la_vue(
                    reconstruit.points[indices[nom]], _zone(detection, vue["points"].shape[:2])
                )

        # La position 3D réunit un objet revu plus tard dans la vidéo, au lieu d'en compter deux.
        fusionner_instances_proches(mesures)
    # Un tapis, une porte ou une fenêtre vus dans une seule image d'une vidéo : presque toujours une erreur.
    mesures = ecarter_vues_uniques(mesures, len(images))
    # Le sol pris pour un tapis en bord d'image, à côté d'un vrai tapis mesuré.
    mesures = ecarter_tapis_jamais_entiers(mesures)

    facteur_a4 = facteur_echelle_a4(mesures)
    facteur = facteur_a4 if (calibrer_a4 and facteur_a4) else 1.0
    failles = construire_failles(mesures, piece, facteur)
    failles = ecarter_failles_tapis_jamais_entieres(failles)
    nb_retires = 0
    if verification and failles:
        # Deuxième avis par un modèle image-texte : écarte la pomme de douche prise pour un détecteur de fumée, etc.
        t = time.perf_counter()
        failles, retirees, avertissement = verifier_avec_siglip(failles, mesures, vues, appareil)
        durees["verification_s"] = time.perf_counter() - t
        avertissements += [avertissement] if avertissement else []
        noms = {(f.element, f.position_3d.get("instance")) for f in retirees}
        mesures = [m for m in mesures if (m.element, m.instance) not in noms]
        sortie.mkdir(parents=True, exist_ok=True)
        # Trace des points retirés (ils n'arrivent pas dans l'app) pour régler les descriptions et le seuil.
        (sortie / "verification.json").write_text(json.dumps(
            [{"element": f.element, "instance": f.position_3d.get("instance"), "garde": f not in retirees,
              **f.position_3d.get("verification", {})} for f in failles + retirees],
            ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        nb_retires = len(retirees)
    finales = {(f.element, f.position_3d["instance"]): f for f in failles}

    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / "annotations").mkdir(exist_ok=True)
    (sortie / "vues.json").write_text(
        json.dumps([asdict(m) for m in mesures], ensure_ascii=False, indent=1, default=float) + "\n", encoding="utf-8"
    )

    def annotations_de(vue: dict) -> list[dict]:
        return [
            {"libelle": _libelle(faille), "boite_px": d.boite_px, "masque": d.masque}
            for d, m in zip(vue["detections"], vue["mesures"]) if (faille := finales.get((m.element, m.instance)))
        ]

    for nom, vue in vues.items():
        annotee = annoter_image(cv2.imread(str(vue["chemin"])), annotations_de(vue), LARGEUR_IMAGE_ANNOTEE)
        cv2.imwrite(str(sortie / "annotations" / nom), annotee)

    def resume(vue: dict) -> list[tuple[str, bool, int]]:
        return [
            (m.element, faille.cote_estimee_cm is not None, (m.boite_px[2] - m.boite_px[0]) * (m.boite_px[3] - m.boite_px[1]))
            for m in vue["mesures"] if (faille := finales.get((m.element, m.instance)))
        ]

    modele_3d = image_annotee = None
    nuage = couleurs = None
    if vues:
        nom = choisir_vue_de_reference({n: resume(v) for n, v in vues.items()})
        vue = vues[nom]
        bgr = cv2.imread(str(vue["chemin"]))
        planche = planche_par_point(failles, vues, _libelle)
        cv2.imwrite(
            str(sortie / "image_annotee.jpg"),
            planche if planche is not None else annoter_image(bgr, annotations_de(vue), LARGEUR_IMAGE_ANNOTEE),
        )
        image_annotee = "image_annotee.jpg"
        if reconstruit is None:
            # Sans reconstruction, le modèle 3D est la seule vue de référence.
            nuage, couleurs = nuage_fusionne(vue["points"][None] * facteur, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)[None], 300_000)
            for faille in failles:
                if faille.position_3d["image_cle"] == nom:
                    faille.position_3d["repere"] = "modele.glb"
    reliefs: dict[str, object] = {}
    if reconstruit is not None:
        reliefs = reliefs_par_vue_cle(failles, vues, reconstruit, indices, facteur)
        # Modèle montré à l'utilisateur : densité régulière (1 point par cube de 1 cm), points isolés retirés.
        # Avec des reliefs, le nuage n'est plus que la vue de repli : il est allégé pour tenir dans 50 Mo.
        nuage, couleurs = nuage_fusionne(
            reconstruit.points * facteur, reconstruit.couleurs, max_points=400_000 if reliefs else 900_000,
            voxel_m=0.01, nettoyer=True,
        )
    if nuage is not None:
        exporter_glb(vers_repere_glb(nuage), couleurs, sortie / "modele.glb", reliefs)
        modele_3d = "modele.glb"

    ecrire_failles(failles, sortie / "failles.json", logement_id, modele_3d)
    durees["total_s"] = time.perf_counter() - debut
    return {
        "failles": failles, "appareil": appareil, "nb_images": len(images), "image_annotee": image_annotee,
        "facteur_a4": facteur_a4, "calibre_a4": facteur != 1.0, "reconstruction": reconstruit is not None,
        "avertissements": avertissements, "points_retires": nb_retires,
        "durees": {k: round(v, 1) for k, v in durees.items()},
    }


def analyser_video(video: Path, sortie: Path, logement_id: str, piece: str | None = None, nb_images: int = 30,
                   calibrer_a4: bool = False, reconstruction: bool = False, presence: bool = False,
                   verification: bool = False, pieces: list[Piece] | None = None) -> dict:
    """Analyse la vidéo entière, ou pièce par pièce si `pieces` donne le découpage (une reconstruction par pièce)."""
    if pieces:
        return _analyser_par_piece(video, sortie, logement_id, pieces, nb_images, calibrer_a4, reconstruction, presence,
                                   verification)
    debut = time.perf_counter()
    images = extraire_images(video, sortie / "images", nb=nb_images)
    extraction_s = round(time.perf_counter() - debut, 1)
    resultat = analyser_images([i.chemin for i in images], sortie, logement_id, piece, calibrer_a4, reconstruction, presence,
                               verification)
    resultat["durees"] = {"extraction_images_s": extraction_s, **resultat["durees"]}
    return resultat


def _analyser_par_piece(video: Path, sortie: Path, logement_id: str, pieces: list[Piece], nb_images: int,
                        calibrer_a4: bool, reconstruction: bool, presence: bool, verification: bool = False) -> dict:
    """Une analyse et une reconstruction par pièce, dans sortie/pieces/<pièce>/, puis un failles.json commun."""
    debut = time.perf_counter()
    failles: list[Faille] = []
    resume: list[dict] = []
    avertissements: list[str] = []
    appareil, nb_total = None, 0
    for nom, segments in regrouper_pieces(pieces).items():
        relatif = f"pieces/{dossier_piece(nom)}"
        dossier = sortie / relatif
        shutil.rmtree(dossier / "images", ignore_errors=True)
        images: list = []
        for debut_s, fin_s in segments:
            # Environ 4 images par seconde filmée, entre 8 et nb_images par segment.
            nb = max(8, min(nb_images, round(4 * (fin_s - debut_s))))
            images += extraire_images(video, dossier / "images", nb=nb, pas_s=0.1, debut_s=debut_s, fin_s=fin_s,
                                      premier_numero=len(images))
        resultat = analyser_images([i.chemin for i in images], dossier, logement_id, nom, calibrer_a4,
                                   reconstruction, presence, verification)
        for faille in resultat["failles"]:
            position = faille.position_3d
            position["repere"] = position["repere"].replace("camera:", f"camera:{relatif}/images/")
            if position["repere"] == "modele.glb":
                position["repere"] = f"{relatif}/modele.glb"
            position["image_cle"] = f"{relatif}/images/{position['image_cle']}"
        failles += resultat["failles"]
        avertissements += [f"{nom} : {a}" for a in resultat["avertissements"]]
        appareil, nb_total = resultat["appareil"], nb_total + len(images)
        resume.append({
            "nom": nom, "segments_s": [list(s) for s in segments], "nb_images": len(images),
            "modele_3d": f"{relatif}/modele.glb" if (dossier / "modele.glb").exists() else None,
            "image_annotee": f"{relatif}/image_annotee.jpg" if resultat["image_annotee"] else None,
            "reconstruction": resultat["reconstruction"], "points_retires": resultat["points_retires"],
            "durees": resultat["durees"],
        })
    ecrire_failles(failles, sortie / "failles.json", logement_id, None, pieces=resume)
    return {
        "failles": failles, "appareil": appareil, "nb_images": nb_total, "image_annotee": None, "facteur_a4": None,
        "calibre_a4": False, "reconstruction": any(p["reconstruction"] for p in resume),
        "avertissements": avertissements, "pieces": resume,
        "points_retires": sum(p["points_retires"] for p in resume),
        "durees": {"total_s": round(time.perf_counter() - debut, 1)},
    }
