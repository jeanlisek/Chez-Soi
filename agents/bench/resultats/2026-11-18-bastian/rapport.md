# U2 — mesures du 18 novembre 2026

Bastian · issue #6 · [PR #32](https://github.com/jeanlisek/Chez-Soi/pull/32).
Copie autorisée dans son compte : `chez-soi-acheteur:1`, skill `verifier-dimension:1`.
La clé ne voit pas l’agent d’Aurélie : ne pas confondre ces révisions avec celles de l’équipe.

## Comparaison : 10 Flash + 10 Pro

Même prompt (`prompt-mesure.md` et SHA dans `protocole.json`), mêmes cinq cas, deux
répétitions chacun, modèles effectifs vérifiés dans `usage_per_model`, sessions séquentielles.

| Mesure | Flash (`holo4-35b-a3b`) | Pro (`holo4-27b`) |
|---|---:|---:|
| Runs conservés | 10 | 10 |
| Durée médiane observée | 65,45 s | 101,55 s |
| Étapes médianes | 11 | 17,5 |
| Coût total observé | 0,379222 USD | 1,132918 USD |
| Appel correct à `get_mesures` | 10/10 | 1/10 |
| Conformité technique automatique initiale | 5/10 | 0/10 |
| Validation humaine finale | À faire | À faire |

Coût total : **1,512140 USD**. Les tokens et coûts de chaque run figurent dans le CSV
et les données brutes intégrées à `evaluations.json`. Une donnée inconnue n’est pas zéro.
Le run Pro 12 a dépassé le délai après validation : annulation demandée, puis statut
`interrupted` confirmé par l’API et quota nul avant reprise. Sa durée 374,6 s est une
borne observée par le lanceur ; la fin API était absente. Ce run reste dans le dénominateur.

La conformité automatique est un contrôle nécessaire, **pas un taux de produits validés** :
les refus pour budget impossible peuvent être conformes. Une recherche incomplète peut
encore produire un refus plausible. Aucune revue humaine n’est simulée ni déclarée faite.

## Pilotage (T32)

| Consigne réelle | Observation | Conséquence pour le live |
|---|---|---|
| Sans découpe, plus petit que 60 × 160 | Flash refuse rapidement. Pro trouve STOPP FILT 50 × 80 à 1,99 € et l’ajoute. | La consigne change bien la sélection, mais le feutre épais ne démontre pas le critère « fin » du profil. Ne pas présenter ce panier comme entièrement validé. |
| Strictement moins de 3 € | Flash refuse ; Pro explore aussi les petites variantes. | Vérifier format et épaisseur en plus du prix ; une offre moins chère ne suffit pas. |
| Livraison en point relais uniquement | Essai séparé après amélioration : absence de confirmation sans code postal, aucun ajout au panier, arrêt à demander_validation. | Bon scénario d’arrêt argumenté ; ne pas inventer une livraison. |

« Moins de 50 € » n’est pas retenu comme preuve d’un effet de pilotage.
Le choix de l’action live (T11) reste à Jean-Li. Flash est le premier candidat pour
le coût, la rapidité et les appels aux mesures ; la fiabilité produit reste à confirmer.

## Ce qui a été corrigé après les 20 runs

- Prompt générique pour tous les objets ; fixture tapis séparée.
- Contrat `citation_decoupe?: string` inchangé et validé dans la discussion de #20.
- Lecture des panneaux produit/dimensions IKEA réellement dépliables, avec exclusion de l’emballage et des contenus cachés arbitraires.
- Custom tool local `lire_fiche_produit`, lecture HTTPS avec liste fermée et redirections contrôlées ; extraits courts et titre issus du site.
- Rappel des données sources avant la réponse finale. La réponse brute reste intacte ; une citation altérée est refusée.

Les validations suivantes sont dans `validations-hors-banc.json` : **elles ne remplacent
aucun des 20 runs et utilisent des versions de prompt distinctes**. Même avec une lecture
textuelle, certaines réponses reformulent les citations ou omettent des champs : limite
à signaler à H. Les textes complets des fiches ne sont pas republiés ; leur empreinte est gardée.

## Sites et limite de la démo

IKEA principal ; Decoweb secours, panier sans compte testé manuellement (voir `preparation/sites-demo.md`).
Les tests H Decoweb n’ont pas suffi à valider toute la proposition. Une page ou une
citation non vérifiable reste un blocage, sans supposition. Aucun achat, compte ou
formulaire personnel. Le coupe-circuit est réactif, il ne bloque pas nativement un clic.

## Relecture n8n

[PR #33](https://github.com/jeanlisek/Chez-Soi/pull/33), empilée sur #4 : citation PDF
non vide et explicitement retrouvée ; conservation de `piece` pour le trigger Supabase.
4 tests passent ; les 17 nœuds Code et les connexions ont été contrôlés, aucune alerte
de secret. Revue « changes requested » publiée sur #4 ; Jean-Li demandé en relecteur.
Aucune activation, synchronisation ou exécution n8n pendant la relecture. Pas de fusion.

## Replay du plan B

[Replay public du pilotage point relais](https://agp.eu.hcompany.ai/share/api/v1/trajectories/dfb8e4d2-8a96-448b-9a87-c5e8b3740cab) — inspection Codex des captures et de la chronologie : demande de code postal laissée vide, modal fermé, aucun ajout au panier, demander_validation puis réponse finale seule. **Périmètre validé : pilotage et arrêt, pas compatibilité produit.** L’ancien replay « sans découpe » a été dépublié : Flash avait manqué une variante plus petite.

La limite qui reste à résoudre est le panier entièrement validé : les essais suivants gardent des erreurs de recopie ou de champs malgré les extraits sources. La PR reste en brouillon pour cette raison ; aucune sélection de produit n’est présentée comme complètement fiabilisée.
