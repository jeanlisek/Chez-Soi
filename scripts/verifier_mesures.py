"""Audit reproductible des mesures CP3, sans API ni nouvelle session H.

python3 scripts/verifier_mesures.py
Les temps manuels restent des estimations d'équipe, jamais des chronométrages.
Les verdicts de la série en production sont repris du CSV, pas réévalués ici.
"""

import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
from statistics import mean, median

from relecture_v2 import runs_bruts, verdict_v2

ROOT = Path(__file__).resolve().parent.parent


def lire(nom):
    with (ROOT / "docs" / nom).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def statistiques(lignes):
    durees = [Decimal(r["duree_s"]) for r in lignes if r["duree_s"]]
    couts = [Decimal(r["cout_usd"]) for r in lignes]
    return {
        "runs": len(lignes), "durees_connues": len(durees),
        "duree_moyenne_s": str(mean(durees)), "duree_mediane_s": str(median(durees)),
        "cout_moyen_usd": str(mean(couts)), "cout_total_usd": str(sum(couts)),
    }


def main():
    historique = lire("resultats_runs.csv")
    finale = lire("resultats_serie_v2.csv")
    assert len(historique) == 40 and len(finale) == 10
    tous = historique + finale
    assert len({r["run"] for r in tous}) == len({r["session"] for r in tous}) == 50
    assert all(Decimal(r["cout_usd"]) >= 0 for r in tous)
    assert [r["run"] for r in historique if not r["duree_s"]] == ["24"]

    bruts = runs_bruts()
    correspondances = 0
    for r in historique:
        if r["usage"] != "2":
            continue
        assert r["session"] in bruts, f"Réponse brute absente : run {r['run']}"
        brut, _ = bruts[r["session"]]
        if r["duree_s"]:
            assert abs(Decimal(r["duree_s"]) - Decimal(str(brut["duree_s"]))) <= Decimal("0.15"), r["run"]
        assert abs(Decimal(r["cout_usd"]) - Decimal(str(brut["cout_usd"]))) <= Decimal("0.00051"), r["run"]
        correspondances += 1
    assert correspondances == 32

    gains = []
    for usage in ("1", "2", "3"):
        sous = [r for r in historique if r["usage"] == usage and r["main_s"]]
        assert len(sous) == 4 and len({r["main_s"] for r in sous}) == 1
        manuel = Decimal(sous[0]["main_s"])
        agent = mean(Decimal(r["duree_s"]) for r in sous)
        gains.append({"usage": usage, "runs": 4, "manuel_estime_s": str(manuel),
                      "agent_mesure_s": str(agent), "gain_estime_s": str(manuel-agent),
                      "gain_estime_pct": str(100*(manuel-agent)/manuel),
                      "rapport_estime": str(manuel/agent)})

    assert all(r["decision_validation"] == "refuse" for r in finale)
    assert all(r["agent"] == "chez-soi-acheteur:2" and r["modele"] == "flash" for r in finale)
    assert all(r["verdict_v2"] == "Succès" and r["verdict_v1"] == "Partiel" for r in finale)
    preuves = json.loads((ROOT / "docs/preuves_fiches_v2.json").read_text())
    preuves = {p["url"]: p for p in preuves if p.get("phrase_decoupe")}
    v2 = Counter()
    for r in historique:
        if r["usage"] == "2":
            brut, evaluation = bruts[r["session"]]
            verdict, _ = verdict_v2(r, brut, evaluation, preuves)
            if verdict != "Succès" and r["resultat"] == "Échec":
                verdict = "Échec"
            v2[verdict] += 1
    assert v2["Succès"] == 14

    fichiers = ["docs/resultats_runs.csv", "docs/resultats_serie_v2.csv", "docs/preuves_fiches_v2.json"]
    print(json.dumps({
        "methode": "Audit des données publiées ; aucun nouveau run H, aucun test humain chronométré.",
        "historique": statistiques(historique),
        "verdicts_v1_historique": dict(Counter(r["resultat"] for r in historique)),
        "verdicts_v2_usage2_relecture": dict(v2),
        "correspondances_brutes_usage2": correspondances,
        "serie_finale": statistiques(finale),
        "gains_estimes_cohorte_1_a_12": gains,
        "limites": ["Les coûts des CSV sont arrondis à la source.",
                    "Les 10 verdicts de production sont déclarés dans le CSV ; leurs trajectoires complètes ne sont pas dans ce fichier.",
                    "Relecture v2 rétrospective : mêmes réponses, règle différente, pas de nouveaux runs.",
                    "Aucun gain humain mesuré : les valeurs manuelles viennent de l'équipe."],
        "sha256_sources": {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in fichiers},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
