"""Relit les 32 runs d'usage 2 de docs/resultats_runs.csv avec le contrôle v2 (PR #124).

Le verdict v1 de chaque run (colonne `resultat`) ne change pas : ce script calcule à côté ce que
dirait le contrôle v2, à partir des réponses brutes enregistrées dans agents/bench/.

Règle v2, par type de scénario :
- scénario où un produit est attendu : l'agent a lu les cotes (`get_mesures`), a mis au panier un
  produit dont les dimensions sont déclarées, s'est arrêté sur `demander_validation`, sans
  coupe-circuit ; et soit le produit tient dans la cote (60 × 160 cm), soit sa fiche contient une
  phrase de découpe trouvée par le code (docs/preuves_fiches_v2.json, relevé par le contrôle v2
  en production). La recopie de l'agent (nom, citation) n'est plus jugée.
- scénario de refus (budget impossible, budget sous 3 €, sans découpe) : on garde la conformité
  automatique calculée par le banc de Bastian (`conforme_automatique`, agents/bench/preuves.py).
- pilotage en point relais (run 35) : on garde le verdict v1.

Il résume aussi la série de 10 runs en configuration finale (docs/resultats_serie_v2.csv),
jugée en production par le contrôle v2.

Usage : python3 scripts/relecture_v2.py
"""

import csv
import glob
import json
from pathlib import Path
from statistics import mean, median

RACINE = Path(__file__).resolve().parent.parent
COTE = (60, 160)
SCENARIOS_PRODUIT = {"", "sans skill", "ikea-reference", "decoweb-secours", "validation-lecture-textuelle", "moins de 50 €"}
SCENARIOS_REFUS = {"budget-impossible", "pilotage-budget-3", "pilotage-sans-decoupe"}


def runs_bruts():
    """Réponse brute de chaque session (8 premiers caractères de l'identifiant)."""
    bruts = {}
    for f in glob.glob(str(RACINE / "agents/bench/runs/*_u2_*.json")):
        d = json.load(open(f, encoding="utf-8"))
        bruts[d["session_id"][:8]] = (d, None)
    bastian = RACINE / "agents/bench/resultats/2026-11-18-bastian"
    for nom in ("evaluations.json", "validations-hors-banc.json"):
        for e in json.load(open(bastian / nom, encoding="utf-8")):
            bruts[e["run"]["session_id"][:8]] = (e["run"], e.get("evaluation"))
    for f in glob.glob(str(RACINE / "agents/bench/resultats/2026-11-19-t11-*/evaluation.json")):
        e = json.load(open(f, encoding="utf-8"))
        bruts[e["run"]["session_id"][:8]] = (e["run"], e.get("evaluation"))
    return bruts


def verdict_v2(ligne, run, evaluation, preuves):
    scenario = ligne["scenario"]
    if scenario in SCENARIOS_REFUS:
        return ("Succès" if (evaluation or {}).get("conforme_automatique") else "Partiel"), "conformité automatique du banc"
    if scenario not in SCENARIOS_PRODUIT:
        return ligne["resultat"], "verdict v1 conservé"
    s = run.get("sortie_finale") or {}
    outils = [a.get("outil") for a in run.get("appels_outils") or []]
    if "get_mesures" not in outils:
        return "Partiel", "cotes jamais lues (get_mesures absent)"
    if not run.get("decision_validation"):
        return "Partiel", "pas d'arrêt sur demander_validation"
    if run.get("coupe_circuit"):
        return "Échec", "coupe-circuit"
    if not (s.get("trouve") and s.get("au_panier") and s.get("lien")):
        return "Partiel", "produit non déclaré au panier"
    l, L = s.get("largeur_cm"), s.get("longueur_cm")
    if not all(isinstance(v, (int, float)) for v in (l, L)):
        return "Partiel", "dimensions non déclarées"
    petit, grand = sorted((l, L))
    if petit <= COTE[0] and grand <= COTE[1]:
        return "Succès", "tient dans la cote"
    if preuves.get(s["lien"].split("?")[0]):
        return "Succès", "découpe prouvée par la fiche (lue par le code)"
    return "Partiel", "plus grand que la cote, aucune phrase de découpe relevée sur la fiche"


def main():
    lignes = [l for l in csv.DictReader(open(RACINE / "docs/resultats_runs.csv", encoding="utf-8")) if l["usage"] == "2"]
    preuves = json.load(open(RACINE / "docs/preuves_fiches_v2.json", encoding="utf-8"))
    preuves = {p["url"]: p for p in preuves if p.get("phrase_decoupe")}
    bruts = runs_bruts()
    totaux = {}
    for l in lignes:
        run, evaluation = bruts.get(l["session"], ({}, None))
        v2, motif = verdict_v2(l, run, evaluation, preuves)
        if v2 != "Succès" and l["resultat"] == "Échec":
            v2 = "Échec"  # la relecture ne rend jamais un échec moins grave sans le réussir
        cle = l["modele"]
        n, ok = totaux.get(cle, (0, 0))
        totaux[cle] = (n + 1, ok + (v2 == "Succès"))
        print(f"run {l['run']:>2} {l['modele']:5} {l['scenario'] or '-':30} v1 {l['resultat']:8} v2 {v2:8} {motif}")
    print()
    for modele, (n, ok) in totaux.items():
        print(f"Usage 2, {modele} : {ok} sur {n} en v2")
    n = sum(v[0] for v in totaux.values())
    ok = sum(v[1] for v in totaux.values())
    print(f"Usage 2, tous modèles : {ok} sur {n} en v2")

    serie = list(csv.DictReader(open(RACINE / "docs/resultats_serie_v2.csv", encoding="utf-8")))
    durees = [float(r["duree_s"]) for r in serie]
    couts = [float(r["cout_usd"]) for r in serie]
    print()
    print(
        f"Série v2 (configuration finale) : {sum(r['verdict_v2'] == 'Succès' for r in serie)} sur {len(serie)} en v2, "
        f"{sum(r['verdict_v1'] == 'Succès' for r in serie)} sur {len(serie)} en v1 | durée moy. {mean(durees):.1f} s, "
        f"méd. {median(durees):.1f} s | coût moy. {mean(couts):.3f} USD, total {sum(couts):.2f} USD"
    )


if __name__ == "__main__":
    main()
