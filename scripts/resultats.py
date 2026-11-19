"""Recalcule les chiffres de docs/resultats.md à partir de docs/resultats_runs.csv.

Usage : python3 scripts/resultats.py
Aucune dépendance hors bibliothèque standard.
"""

import csv
from pathlib import Path
from statistics import mean, median

CSV = Path(__file__).resolve().parent.parent / "docs" / "resultats_runs.csv"


def nombre(valeur):
    return float(valeur) if valeur else None


def resume(lignes, titre):
    n = len(lignes)
    succes = sum(l["resultat"] == "Succès" for l in lignes)
    partiels = sum(l["resultat"] == "Partiel" for l in lignes)
    echecs = sum(l["resultat"] == "Échec" for l in lignes)
    durees = [nombre(l["duree_s"]) for l in lignes if l["duree_s"]]
    couts = [nombre(l["cout_usd"]) for l in lignes]
    print(
        f"{titre:34} {n:2} runs | succès {succes:2} ({100 * succes / n:5.1f} %) | partiels {partiels:2} | échecs {echecs} | "
        f"durée moy. {mean(durees):6.1f} s, méd. {median(durees):6.1f} s ({len(durees)} durées) | "
        f"coût moy. {mean(couts):.3f} USD, méd. {median(couts):.3f}, total {sum(couts):.2f}"
    )


def main():
    runs = list(csv.DictReader(CSV.open(encoding="utf-8")))
    resume(runs, "Tous les runs")
    for usage in ("1", "2", "3"):
        resume([r for r in runs if r["usage"] == usage], f"Usage {usage}")
    for modele in ("flash", "pro"):
        resume([r for r in runs if r["usage"] == "2" and r["modele"] == modele], f"Usage 2, {modele}")
        resume([r for r in runs if r["cadre"] == "banc" and r["modele"] == modele], f"Banc usage 2, {modele}")
    print()
    for usage in ("1", "2", "3"):
        avec_main = [r for r in runs if r["usage"] == usage and r["main_s"]]
        agent = mean(nombre(r["duree_s"]) for r in avec_main)
        main_s = nombre(avec_main[0]["main_s"])
        print(f"Usage {usage} : agent {agent:5.1f} s en moyenne sur {len(avec_main)} runs, à la main {main_s:.0f} s (estimation), rapport {main_s / agent:4.1f}")


if __name__ == "__main__":
    main()
