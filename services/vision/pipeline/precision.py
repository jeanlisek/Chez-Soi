"""Mesure de précision : compare failles.json aux dimensions réelles relevées au mètre ruban.

python -m pipeline.precision --failles sorties/<nom>/failles.json --verite donnees/verite.json
Le fichier de vérité est une liste : [{"element": "tapis", "dimension": "longueur_cm", "reel_cm": 160.0}, …]
Quand la vidéo montre plusieurs objets du même type, ajouter "piece" et "instance" (le numéro donné dans position_3d).
"""

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Ecart:
    element: str
    dimension: str
    mesure_cm: float | None
    reel_cm: float
    ecart_cm: float | None
    ecart_pct: float | None


def comparer(failles: list[dict], verite: list[dict]) -> list[Ecart]:
    ecarts = []
    for attendu in verite:
        candidates = [
            f for f in failles
            if f["element"] == attendu["element"]
            and ("instance" not in attendu or f.get("position_3d", {}).get("instance") == attendu["instance"])
            and ("piece" not in attendu or f.get("piece") == attendu["piece"])
        ]
        mesure = candidates[0].get(attendu["dimension"]) if candidates else None
        reel = float(attendu["reel_cm"])
        ecart = None if mesure is None else mesure - reel
        ecarts.append(Ecart(attendu["element"], attendu["dimension"], mesure, reel, ecart,
                            None if ecart is None else 100 * ecart / reel))
    return ecarts


def _fr(valeur: float) -> str:
    return f"{valeur:.1f}".replace(".", ",")


def tableau_markdown(ecarts: list[Ecart]) -> str:
    lignes = ["| Objet | Dimension | Mesuré (cm) | Réel (cm) | Écart (cm) | Écart |", "|---|---|---|---|---|---|"]
    for e in ecarts:
        dimension = e.dimension.removesuffix("_cm")
        if e.mesure_cm is None:
            lignes.append(f"| {e.element} | {dimension} | non mesuré | {_fr(e.reel_cm)} | | |")
        else:
            lignes.append(f"| {e.element} | {dimension} | {_fr(e.mesure_cm)} | {_fr(e.reel_cm)} | {_fr(e.ecart_cm)} | {_fr(e.ecart_pct)} % |")
    return "\n".join(lignes)


def main() -> None:
    parseur = argparse.ArgumentParser(description="Compare les cotes du pipeline aux mesures au mètre ruban.")
    parseur.add_argument("--failles", type=Path, required=True)
    parseur.add_argument("--verite", type=Path, required=True)
    options = parseur.parse_args()
    failles = json.loads(options.failles.read_text(encoding="utf-8"))["failles"]
    print(tableau_markdown(comparer(failles, json.loads(options.verite.read_text(encoding="utf-8")))))


if __name__ == "__main__":
    main()
