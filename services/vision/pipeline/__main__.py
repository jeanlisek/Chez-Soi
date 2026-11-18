"""Commande locale : python -m pipeline --video <fichier> --sortie <dossier>."""

import argparse
import json
from pathlib import Path

from .analyse import Piece, _libelle as libelle_faille, analyser_images, analyser_video


def main() -> None:
    parseur = argparse.ArgumentParser(description="Analyse une vidéo du logement : failles, cotes, image annotée, .glb.")
    source = parseur.add_mutually_exclusive_group(required=True)
    source.add_argument("--video", type=Path, help="Vidéo du logement (reste hors du dépôt).")
    source.add_argument("--images", type=Path, help="Dossier d'images déjà extraites (.jpg), à la place de la vidéo.")
    parseur.add_argument("--sortie", type=Path, required=True, help="Dossier des résultats.")
    parseur.add_argument("--logement-id", default="local")
    parseur.add_argument("--piece", default=None, help="Nom de la pièce filmée (ex. sejour).")
    parseur.add_argument("--pieces", type=Path, default=None,
                         help='Découpage de la vidéo, en JSON : [{"nom": "chambre", "debut_s": 21.0, "fin_s": 27.6}, …]. '
                              "Chaque pièce a alors sa propre analyse et sa propre reconstruction.")
    parseur.add_argument("--nb-images", type=int, default=30, help="Nombre d'images nettes à garder (20 à 40).")
    parseur.add_argument("--calibrer-a4", action="store_true", help="Corrige l'échelle avec la feuille A4 vue au sol.")
    parseur.add_argument("--presence", action="store_true",
                         help="Cherche aussi serrures, escaliers, éclairage, interrupteurs et détecteurs (peu fiable en basse définition).")
    parseur.add_argument("--reconstruction", action="store_true",
                         help="Reconstruction multi-vues (MapAnything) : .glb de toute la pièce, objets distincts séparés.")
    options = parseur.parse_args()

    if options.video:
        pieces = None
        if options.pieces:
            pieces = [Piece(**p) for p in json.loads(options.pieces.read_text(encoding="utf-8"))]
        resultat = analyser_video(options.video, options.sortie, options.logement_id, options.piece,
                                  options.nb_images, options.calibrer_a4, options.reconstruction, options.presence, pieces)
    else:
        images = sorted(options.images.glob("*.jpg"))
        resultat = analyser_images(images, options.sortie, options.logement_id, options.piece, options.calibrer_a4,
                                   options.reconstruction, options.presence)

    print(f"\n{resultat['nb_images']} images analysées sur « {resultat['appareil']} »")
    for faille in resultat["failles"]:
        marge = "" if faille.marge_cm is None else f" (± {faille.marge_cm} cm)"
        position = faille.position_3d
        lieu = f"[{faille.piece}] " if faille.piece else ""
        print(f"  - {lieu}{libelle_faille(faille)}{marge} · {position['nb_vues_entieres']} vue(s) entière(s) sur {position['nb_vues']} · {position['image_cle']}")
    if resultat["facteur_a4"]:
        etat = "appliqué" if resultat["calibre_a4"] else "non appliqué"
        print(f"Facteur d'échelle d'après la feuille A4 : {resultat['facteur_a4']:.3f} ({etat})")
    for avertissement in resultat["avertissements"]:
        print("Attention :", avertissement)
    print("Durées :", json.dumps(resultat["durees"], ensure_ascii=False))
    print("Résultats dans", options.sortie)


if __name__ == "__main__":
    main()
