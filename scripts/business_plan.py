"""Prévisionnel Chez Soi proposé, 2027–2029, en EUR, sans API.

python3 scripts/business_plan.py
Génère les annexes de docs/business-plan/ ; tous les paramètres commerciaux sont
des estimations fictives non validées, aucune donnée commerciale n'est observée.
Décimales conservées pour les contrôles, arrondis uniquement dans les exports.
"""
import csv
import json
from decimal import Decimal as D, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/business-plan"
TVA = D("0.20")
PILOTE = D(5000)
LICENCE = D(8000)
PRIX_B2B = D(12)
PRIX_B2C_HT = D("32.5")  # 39 EUR TTC sous hypothèse de TVA à 20 %
COUT_B2B = D(4)
COUT_B2C = D(5)  # 4 EUR de service + 1 EUR de paiement, ce dernier sans TVA déductible
FINANCEMENT = D(350000)  # objectif non sécurisé : 20 kEUR fondateurs + 330 kEUR investisseurs
CAPEX = D(6000)

ANNEES = [
    {"annee": 2027, "pilotes": [4,6,8,10], "clients": [0,0,0,0,0,0,0,0,1,1,2,2],
     "b2b": [0,0,0,0,0,0,0,0,100,200,350,550],
     "b2c": [0,0,0,0,5,10,15,20,25,30,40,55],
     "fixes": {"personnel_charge":90000,"infra_fixe":18000,"commercial_marketing":20000,"qualite_juridique_assurance":18000,"gestion":14000},
     "nouveaux_clients":2,"clients_fin":2,"sortants":0},
    {"annee": 2028, "pilotes": [1,2,4,5,7,8,10,11], "clients": [2,3,3,4,4,5,5,6,6,7,7,8],
     "b2b": [200,250,300,350,400,450,500,550,600,650,800,950],
     "b2c": [30,40,40,50,50,60,70,80,80,90,100,110],
     "fixes": {"personnel_charge":150000,"infra_fixe":24000,"commercial_marketing":30000,"qualite_juridique_assurance":14000,"gestion":12000},
     "nouveaux_clients":6,"clients_fin":8,"sortants":0},
    {"annee": 2029, "pilotes": [1,1,2,3,4,5,6,7,8,9,10,11], "clients": [7,8,8,9,10,11,12,13,14,15,15,16],
     "b2b": [1000,1200,1400,1600,1800,2000,2200,2400,2600,2800,2900,3100],
     "b2c": [100,110,120,130,140,150,160,170,190,210,240,280],
     "fixes": {"personnel_charge":220000,"infra_fixe":30000,"commercial_marketing":40000,"qualite_juridique_assurance":20000,"gestion":20000},
     "nouveaux_clients":9,"clients_fin":16,"sortants":1},
]


def arrondi(v):
    return str(D(v).quantize(D("0.01"), rounding=ROUND_HALF_UP))


def construire(delai_b2b=1, cout_b2b=COUT_B2B, cout_b2c=COUT_B2C):
    mois = []
    for a in ANNEES:
        for m in range(1,13):
            debuts = a["pilotes"].count(m)
            fins = a["pilotes"].count(m-1)
            incl = (debuts+fins)*50
            clients = a["clients"][m-1]
            b2b, b2c = a["b2b"][m-1], a["b2c"][m-1]
            personnel = D(a["fixes"]["personnel_charge"])/12
            autres = D(sum(v for k,v in a["fixes"].items() if k != "personnel_charge"))/12
            # Le lancement concentre l'audit aux premiers mois ; somme identique au compte de résultat.
            if a["annee"] == 2027:
                marketing = [500,500,1000,1000,1500,1500,2000,2000,2000,2500,2500,3000][m-1]
                qualite = [6000,4000,2000,1000,1000,1000,500,500,500,500,500,500][m-1]
                autres = D(18000+14000)/12+D(marketing+qualite)
            rev_pilote = D(debuts+fins)*PILOTE/2
            rev_licence = D(clients)*LICENCE/12
            rev_b2b, rev_b2c = D(b2b)*PRIX_B2B, D(b2c)*PRIX_B2C_HT
            variable = D(b2b+incl)*cout_b2b+D(b2c)*cout_b2c
            facture_b2b = D(debuts)*PILOTE+rev_licence+rev_b2b
            mois.append(dict(annee=a["annee"],mois=m,clients=clients,diagnostics_b2b=b2b,
                             diagnostics_pilotes=incl,diagnostics_b2c=b2c,ca_pilotes=rev_pilote,
                             ca_licences=rev_licence,ca_b2b=rev_b2b,ca_b2c=rev_b2c,
                             ca_ht=rev_pilote+rev_licence+rev_b2b+rev_b2c,
                             facture_b2b_ht=facture_b2b,personnel=personnel,autres_fixes=autres,
                             cout_variable=variable,capex=CAPEX if len(mois)==0 else D(0)))

    cash, credit_tva, tva_a_payer = D(0), D(0), D(0)
    for i,r in enumerate(mois):
        enc_b2b = mois[i-delai_b2b]["facture_b2b_ht"] if i >= delai_b2b else D(0)
        enc_ht = enc_b2b+r["ca_b2c"]
        encaisses = enc_ht*(1+TVA)
        # TVA sur services à l'encaissement ; décaissement à M+1, crédits non remboursés.
        achats_eligibles = r["autres_fixes"]+r["cout_variable"]-D(r["diagnostics_b2c"])+r["capex"]
        tva_entree = achats_eligibles*TVA
        versement_tva = tva_a_payer
        solde_tva = enc_ht*TVA-tva_entree-credit_tva
        credit_tva = max(D(0),-solde_tva)
        tva_a_payer = max(D(0),solde_tva)
        exploitation = r["personnel"]+r["autres_fixes"]+r["cout_variable"]+tva_entree-r["capex"]*TVA
        investissement = r["capex"]*(1+TVA)
        apport = FINANCEMENT if i==0 else D(0)
        ouverture = cash
        cash += apport+encaisses-exploitation-investissement-versement_tva
        r.update(cash_ouverture=ouverture,financement=apport,encaissements_ttc=encaisses,
                 decaissements_exploitation_ttc=exploitation,investissements_ttc=investissement,
                 tva_versee=versement_tva,credit_tva_fin=credit_tva,tva_a_payer_mois_suivant=tva_a_payer,
                 tresorerie_fin=cash)
        assert abs(cash-(ouverture+apport+encaisses-exploitation-investissement-versement_tva)) < D("0.00001")

    annuels = []
    deficit_fiscal = D(0)
    for a in ANNEES:
        rs = [r for r in mois if r["annee"]==a["annee"]]
        total = lambda cle: sum((r[cle] for r in rs),D(0))
        ca, variable = total("ca_ht"),total("cout_variable")
        fixes = total("personnel")+total("autres_fixes")
        ebitda = ca-variable-fixes
        resultat_avant_impot = ebitda-D(2000)
        # Aucun impôt dans ce scénario : les pertes antérieures dépassent le bénéfice 2029.
        imposable = max(D(0),resultat_avant_impot-deficit_fiscal)
        impot = imposable*D("0.25")
        deficit_fiscal = max(D(0),deficit_fiscal-resultat_avant_impot)
        assert impot == 0
        fin_annee = (a["annee"]-ANNEES[0]["annee"]+1)*12
        ar = sum((r["facture_b2b_ht"] for r in mois[max(0,fin_annee-delai_b2b):fin_annee]),D(0))
        annuel = dict(annee=a["annee"],pilotes=len(a["pilotes"]),clients_fin=a["clients_fin"],
                      clients_equivalent_annee=D(sum(a["clients"]))/12,
                      diagnostics_b2b=sum(a["b2b"]),diagnostics_pilotes=len(a["pilotes"])*100,
                      diagnostics_b2c=sum(a["b2c"]),ca_pilotes=total("ca_pilotes"),
                      ca_licences=total("ca_licences"),ca_usage_b2b=total("ca_b2b"),ca_b2c=total("ca_b2c"),
                      ca_ht=ca,cout_variable=variable,marge_contribution=ca-variable,
                      taux_marge=(ca-variable)/ca*100,charges_fixes=fixes,ebitda=ebitda,
                      amortissement=D(2000),impot_societes=impot,resultat_net=resultat_avant_impot-impot,
                      tresorerie_fin=rs[-1]["tresorerie_fin"],creances_clients_ht=ar,
                      credit_tva_fin=rs[-1]["credit_tva_fin"],tva_a_payer=rs[-1]["tva_a_payer_mois_suivant"])
        assert fixes == sum(D(v) for v in a["fixes"].values()) or abs(fixes-D(sum(a["fixes"].values()))) < D("0.00001")
        annuels.append(annuel)
    return mois, annuels


def exporter_csv(nom, lignes):
    with (OUT/nom).open("w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=["statut"]+list(lignes[0]),lineterminator="\n");w.writeheader()
        w.writerows({"statut":"ESTIMATION_FICTIVE_NON_VALIDEE",**{k:arrondi(v) if isinstance(v,D) else v for k,v in r.items()}} for r in lignes)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    mois,annuels=construire()
    assert [a["ca_ht"].quantize(D("0.01")) for a in annuels] == [D(44900),D(178000),D(517000)]
    assert [a["ebitda"].quantize(D("0.01")) for a in annuels] == [D(-122500),D(-83200),D(72200)]
    assert [a["clients_equivalent_annee"] for a in annuels] == [D("0.5"),D(5),D("11.5")]
    assert [a["diagnostics_b2b"]+a["diagnostics_pilotes"]+a["diagnostics_b2c"] for a in annuels] == [1800,7600,28200]
    assert abs(sum(r["facture_b2b_ht"] for r in mois)-sum(r["ca_ht"]-r["ca_b2c"] for r in mois)) < D("0.00001")
    exporter_csv("previsionnel-annuel.csv",annuels)
    exporter_csv("tresorerie-36-mois.csv",mois)
    stress,_=construire(delai_b2b=3)
    cher,_=construire(cout_b2b=D(6),cout_b2c=D(7))
    combine,_=construire(delai_b2b=3,cout_b2b=D(6),cout_b2c=D(7))
    diagnostic_equilibre=(D(330000)-D(92000)-D(60000-1200*4)-D(65000-2000*5))/D(8)
    recurrent=(D(330000)-D(92000)-D(65000-2000*5))/D(8)
    resultats={"statut":"ESTIMATIONS FICTIVES NON VALIDÉES ; ni ventes acquises ni financements sécurisés",
               "financement_initial_eur":FINANCEMENT,"minimum_tresorerie_eur":min(r["tresorerie_fin"] for r in mois),
               "minimum_tresorerie_b2b_90_jours_eur":min(r["tresorerie_fin"] for r in stress),
               "minimum_tresorerie_cout_plus_2_eur":min(r["tresorerie_fin"] for r in cher),
               "minimum_tresorerie_stress_combine_eur":min(r["tresorerie_fin"] for r in combine),
               "financement_supplementaire_pour_reserve_80k_stress_combine":D(80000)-min(r["tresorerie_fin"] for r in combine),
               "seuil_b2b_avec_pilotes_2029":diagnostic_equilibre,
               "seuil_b2b_sans_nouveaux_pilotes_2029":recurrent,
               "ebitda_sans_nouveaux_pilotes_2029":D(72200)-D(60000-1200*4),
               "tests":"Populations, CA, EBITDA, équivalents annuels, double compte des pilotes, équilibre mensuel et résultat fiscal vérifiés par assertions."}
    (OUT/"controles-financiers.json").write_text(json.dumps(resultats,ensure_ascii=False,indent=2,default=lambda v:arrondi(v))+"\n")
    scenarios=[]
    for nom,pilotes,clients_eq,b2b,b2c,fixes in [
        ("Prudent",8,D(8),12500,1000,280000),
        ("Central",12,D("11.5"),25000,2000,330000),
        ("Accéléré",12,D(16),37500,3000,400000),
    ]:
        ca=D(pilotes)*PILOTE+clients_eq*LICENCE+D(b2b)*PRIX_B2B+D(b2c)*PRIX_B2C_HT
        cout=D(b2b+pilotes*100)*COUT_B2B+D(b2c)*COUT_B2C
        scenarios.append(dict(scenario=nom,pilotes=pilotes,clients_equivalent_annee=clients_eq,
                              diagnostics_b2b=b2b,diagnostics_b2c=b2c,ca_ht=ca,
                              cout_variable=cout,charges_fixes=fixes,ebitda=ca-cout-D(fixes)))
    assert scenarios[1]["ca_ht"] == D(517000) and scenarios[1]["ebitda"] == D(72200)
    exporter_csv("scenarios-2029.csv",scenarios)
    for a in annuels:
        print(a["annee"],"CA",arrondi(a["ca_ht"]),"EBITDA",arrondi(a["ebitda"]),"cash",arrondi(a["tresorerie_fin"]))
    print(json.dumps(resultats,ensure_ascii=False,indent=2,default=lambda v:arrondi(v)))


if __name__=="__main__":
    main()
