# Annexes financières — estimations fictives

Ces fichiers sont une **simulation fictive non validée**, pas les comptes ni les ventes de Chez Soi.
Ils accompagnent le [business plan jury](../business-plan.md), daté du 20/11/2026.

Recalculer depuis la racine, avec Python 3 sans dépendances :

```sh
python3 scripts/business_plan.py
```

Les paramètres sont en tête du script : prix, volumes mensuels, clients actifs,
effectifs, coûts, capital, TVA et délais. Chaque ligne des CSV porte le statut
`ESTIMATION_FICTIVE_NON_VALIDEE` pour éviter de la confondre avec une observation.

- `previsionnel-annuel.csv` : volumes, compte de résultat et situation de trésorerie.
- `tresorerie-36-mois.csv` : 2027–2029, encaissements TTC, financement initial fictif,
  dépenses, investissement TTC, crédits et reversements de TVA.
- `scenarios-2029.csv` : variantes annuelles, sans leur attribuer une probabilité.
- `controles-financiers.json` : seuils et tests de sensibilité, toujours fictifs.

Le modèle distingue revenu et encaissement des pilotes (prestation sur deux mois),
ne facture pas une seconde fois leurs 100 dossiers inclus, pondère les licences par
mois de client actif, n'immobilise pas le développement et ne consomme aucune API.
Les coûts variables incluent un support courant externalisé, distinct du personnel
de développement/vente. Ils ne couvrent pas une visite d'ergothérapeute ni des travaux.

Vérifications effectuées : assertions du modèle, génération identique sur deux
exécutions, rapprochement indépendant des CSV (financement + encaissements − sorties
= solde final ; écart d'arrondi inférieur à 0,10 € sur 36 mois), cohérence des volumes,
des seuils et du prévisionnel publié. Aucun nouveau test H ni aucune collecte réelle.

La simulation suppose une TVA à 20 %, déduite des achats éligibles à ce même taux,
hors frais de paiement B2C ; aucun remboursement du crédit de TVA. Cette simplification
et le report des déficits devront être validés par un expert-comptable, notamment
pour la TVA des prestataires réels. Aucun apport, prêt, devis ou financement n'est acquis.
