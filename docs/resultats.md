# Résultats mesurés de l'agent H

Vérification complémentaire du 20/11 : [calculs, rapprochement des réponses brutes, tests et gains de temps estimés](verification-mesures.md), reproductibles avec `python3 scripts/verifier_mesures.py`.

Ce document rassemble les 40 runs réels de l'agent H Company lancés par l'équipe les 18 et 19 novembre 2026, sur de vrais sites, sans aucun achat ni envoi. Chaque run est une ligne de [`resultats_runs.csv`](resultats_runs.csv), reprise de l'onglet « Mesures agent » du tableau de pilotage de l'équipe. Les chiffres ci-dessous se recalculent avec :

```bash
python3 scripts/resultats.py
```

Où trouver la preuve de chaque run :

- runs 1 à 12 : sortie brute et contrôle dans [`agents/bench/runs/`](../agents/bench/runs/) (un JSON par session) ;
- runs 13 à 40 : réponses brutes, captures et actions dans [`agents/bench/resultats/`](../agents/bench/resultats/) (banc Flash/Pro de Bastian, PR #32) ;
- runs 5 et 35 : replay public H Company (liens plus bas).

## Mise à jour du 20/11 : configuration finale et contrôle v2

Les verdicts des 40 runs ci-dessous ne changent pas (règle stricte v1). Ils mélangent trois choses : les essais de développement, le modèle Pro écarté, et des « Partiel » qui sont presque tous un bon produit au panier dont l'agent a mal recopié la phrase de la fiche. Deux ajouts les remettent en perspective.

**Contrôle v2 (PR #124).** Le code ne juge plus la recopie de l'agent : il relit la fiche lui-même et y cherche la phrase de découpe et les dimensions annoncées. Sans ces preuves sur la fiche, le produit reste refusé. La phrase relevée par le code est gardée dans `runs_agent` (`sortie_finale.preuves_fiche`) et dans [`preuves_fiches_v2.json`](preuves_fiches_v2.json).

**Série en configuration finale** (Flash, `chez-soi-acheteur:2`, skill `verifier-dimension:2`, IKEA France, paillasson de l'entrée de 38 × 59 cm), lancée depuis l'application en production les 19 et 20/11 entre 23 h 59 et 0 h 14, une session à la fois, chaque validation refusée. Détail : [`resultats_serie_v2.csv`](resultats_serie_v2.csv).

| Mesure | Valeur |
|---|---|
| Runs | 10 |
| Contrôle v2 : bon produit au panier, découpe et dimensions prouvées par la fiche, arrêt sur `demander_validation` | **10 sur 10** |
| Règle stricte v1 sur les mêmes réponses | 0 sur 10 : l'agent écrit « tissus » au lieu de « tapis » dans sa citation à chaque run |
| Durée moyenne | 74,0 s (médiane 74,7 s), 10 à 12 étapes |
| Coût moyen | 0,025 USD (0,25 USD pour la série) |
| Coupe-circuit, achat, envoi | aucun |

Écart non bloquant relevé à chaque run : le délai de livraison est absent, IKEA ne l'affiche pas sans code postal.

**Relecture v2 des 32 runs d'usage 2 enregistrés** (`python3 scripts/relecture_v2.py`). Scénario où un produit est attendu : cotes lues par `get_mesures`, produit au panier avec ses dimensions, arrêt sur `demander_validation`, et produit qui tient dans la cote ou dont la fiche prouve la découpe. Scénarios de refus (budget impossible, budget sous 3 €, sans découpe) : conformité automatique du banc de Bastian, inchangée. Un échec v1 qui ne réussit pas en v2 reste un échec.

| Configuration | v1 (stricte) | v2 |
|---|---|---|
| Flash, tous agents (20 runs) | 3 | **14** |
| Pro, écarté pour la démo (12 runs) | 0 | 0 : il n'appelle `get_mesures` que dans 1 run sur 12 |
| Usage 2, tous modèles (32 runs) | 3 (9,4 %) | 14 (43,8 %) |
| Tous usages (40 runs) | 11 (27,5 %) | 22 (55 %) |

Les 6 runs Flash qui restent en échec v2 : 4 où l'agent ne déclare pas le produit au panier (dont les deux sur Decoweb, site de secours), 1 sans dimensions déclarées (schéma imbriqué du run 1), 1 sans arrêt sur la validation.

## Ce que « Succès » veut dire

H fournit un champ `outcome` auto-évalué par l'agent. Il est resté vide (`null`) sur les 40 runs, alors que les sessions se terminaient avec une réponse finale. Le résultat de chaque ligne est donc **notre verdict**, pas celui de H :

| Cadre | Runs | Qui décide | Succès si |
|---|---|---|---|
| `equipe` | 1 à 12 | Relecture humaine du run et contrôle du code (`agents/dev/controle.ts`) | La tâche est faite (bon PDF, bon produit au panier, bon récapitulatif) et l'agent s'arrête sur la validation |
| `banc` | 13 à 32 | Contrôle automatique strict du banc (PR #32) | En plus : chaque citation (dimensions, découpe, compatibilité) est retrouvée mot pour mot sur la fiche publique |
| `hors_banc` | 33 à 37 | Contrôle strict, revue des captures | Idem ; le run 35 est noté Succès pour le pilotage et l'arrêt, pas pour le produit |
| `t11` | 38 à 40 | Contrôle strict, revue des captures | Idem |

Conséquence : un run du banc qui met le bon produit au panier mais recopie mal une citation est compté « Partiel ».

## Synthèse

| Mesure | Valeur | Sur combien de runs |
|---|---|---|
| Taux de réussite, tous usages | 27,5 % (11 succès, 27 partiels, 2 échecs) | 40 |
| Usage 1, conditions générales de l'assureur | 4 sur 4 | 4 |
| Usage 3, préparation de l'OTV et de l'information de l'assureur | 4 sur 4 | 4 |
| Usage 2, contre-mesure au panier | 3 sur 32 (9,4 %) | 32 |
| Durée moyenne d'un run | 88,5 s (médiane 81,9 s) | 39 (le run 24, coupé sans heure de fin, est exclu) |
| Coût moyen d'un run | 0,062 USD (médiane 0,041 USD) | 40 |
| Coût total des 40 runs | 2,49 USD | 40 |

### Temps gagné par rapport à la même tâche faite à la main

Seuls les runs 1 à 12 ont un temps « à la main » renseigné. Ce temps est une **estimation de l'équipe** (une valeur par usage), pas un chronométrage.

| Usage | Agent, moyenne | À la main, estimation | Rapport |
|---|---|---|---|
| 1 · Conditions générales de l'assureur | 126 s (4 runs) | 360 s | 2,9 |
| 2 · Contre-mesure au panier | 97 s (4 runs) | 240 s | 2,5 |
| 3 · OTV et information de l'assureur | 78 s (4 runs) | 900 s | 11,6 |

La durée du run 1 comprend environ 125 s d'attente de la validation humaine.

### Flash ou Pro (usage 2)

Le banc a rejoué 5 scénarios, deux fois chacun, avec chaque modèle, à configuration constante : référence IKEA, site de secours Decoweb, profil qui interdit la découpe, consigne « moins de 50 € » envoyée pendant le run, budget impossible.

| Modèle | Runs du banc | Succès | Durée moyenne | Coût moyen |
|---|---|---|---|---|
| Flash (`holo4-35b-a3b`) | 10 | 0 | 77,3 s | 0,038 USD |
| Pro (`holo4-27b`) | 10 | 0 | 94,7 s sur 9 runs, plus le run 24 coupé après au moins 374,6 s | 0,113 USD |

Sur ces 20 runs, l'outil `get_mesures` est appelé correctement dans 10 runs Flash sur 10 et dans 1 run Pro sur 10 : Pro appelle des outils qui n'existent pas (`get_esures`, `get_epures`). Décision de l'équipe le 19/11 : Flash pour la démo, plus rapide, trois fois moins cher et sans erreur de nom d'outil.

## Cas d'échec

| Cas | Runs concernés | Ce qui se passe | Ce que fait le code |
|---|---|---|---|
| Transcription altérée | 3, 36, 37, 38, 40 | L'agent recopie « pour tissus » au lieu de « pour tapis », « Antidimapant » au lieu de « Antidérapant », même quand le texte exact lui est fourni | La citation est recherchée sur la fiche publique après le run (`agents/dev/fiche.ts`) ; une citation introuvable fait refuser le produit |
| Citation de découpe absente | 7, 13, 15, 16, 25, 26, 33, 34 | Le produit (67,5 × 200 cm) est plus grand que la cote (60 × 160 cm) et la réponse n'apporte pas la phrase de la fiche qui autorise la découpe | Produit refusé : la skill `verifier-dimension` exige cette citation |
| Mauvais nom d'outil (Pro) | 23 à 26, 28 à 32, 34, 39 | Le contrôle relève un outil obligatoire manquant ou en erreur ; les traces montrent des appels à `get_esures` ou `get_epures` au lieu de `get_mesures` | Aucune cote inventée n'est acceptée ; le run 39 finit en échec |
| Schéma imbriqué rejeté | 1 | Avec un objet `dimensions` imbriqué, H rejette la réponse 4 fois, puis accepte `null` | Schéma aplati (`largeur_cm`, `longueur_cm`) dès le run 2, revalidé par Zod côté app |
| Parcours trop long | 4 | 36 étapes sur 39 à chercher un document facultatif, avec des adresses devinées | Révision 2 de l'agent : 27 à 28 étapes, coût divisé par 1,4 à 1,7 (runs 5 et 9) |
| Session qui ne s'arrête pas | 24 | Toujours `running` après l'annulation ; `interrupted` à une lecture ultérieure | Le banc confirme l'état terminal et le quota avant le run suivant |

Aucun achat ni envoi n'a eu lieu sur les 40 runs. Sur les 12 runs enregistrés dans le dépôt, le coupe-circuit ne s'est jamais déclenché : aucune page de paiement, de commande ou de connexion n'a été ouverte.

## Replays publics

- Usage 1, run 5 (MAIF, bon PDF trouvé) : https://agp.eu.hcompany.ai/share/api/v1/trajectories/6737e71f-59a5-4dc5-ab92-20c49a33d469
- Usage 2, run 35 (pilotage « point relais uniquement », arrêt sans ajout au panier ; plan B de la démo) : https://agp.eu.hcompany.ai/share/api/v1/trajectories/dfb8e4d2-8a96-448b-9a87-c5e8b3740cab

Ces liens renvoient la trajectoire au format de l'API de partage de H Company (étapes, captures, réponse finale).

## Ce que l'Agents API nous a appris

Relevé complet dans l'onglet « Retours Agent API » du tableau de pilotage ; les points qui ont changé le code :

**Ce qui a marché**

- Navigateur cloud sur IKEA France, maif.fr, service-public.gouv.fr et acheel.com, sans compte et sans blocage anti-robot.
- Custom tool de validation : la session passe en `awaiting_tool_results` et attend notre réponse (125 s sans échec), puis reprend.
- `/changes` expose les pages vues et les actions choisies : c'est ce qui rend notre coupe-circuit possible.
- Agents maison, skill et révisions figées (`nom:N`) créés par l'API, sans lancer de session.
- Pilotage en cours de run (`steer`) : au run 35, la consigne « point relais uniquement » change le parcours de l'agent.
- Skill `verifier-dimension` : avec elle, citation de découpe tirée de la fiche, 47 s et 0,022 USD ; sans elle, aucune citation, 70 s et 0,031 USD (un run de chaque côté).

**Ce qui a cassé ou surpris**

- Aucun garde-fou natif sur une action du navigateur : rien n'empêche l'agent de cliquer sur « Commander ». D'où notre coupe-circuit dans le code, qui annule la session dès qu'une page de paiement, de commande ou de connexion apparaît.
- Un custom tool et un clic peuvent partir dans la même étape : le prompt exige que `demander_validation` soit seul dans son étape.
- `outcome` reste vide ; les réponses rejetées par le schéma comptent comme des étapes et n'apparaissent que comme « Error », sans motif.
- Le quota de 3 sessions simultanées vaut pour toute l'organisation : le script refuse de créer une session si une autre est active.
- `overrides["agent.skills"]` remplace toute la liste des skills d'un agent du catalogue : la skill passe par un agent maison.

## Coût de run par diagnostic

Statut : **calcul**, à partir des moyennes mesurées ci-dessus et d'hypothèses explicites. Il n'a pas été mesuré de bout en bout.

| Poste | Valeur retenue | Origine |
|---|---|---|
| Agent, usage 1 | 0,081 USD | moyenne mesurée, 4 runs |
| Agent, usage 2, Flash | 0,033 USD par contre-mesure | moyenne mesurée, 20 runs Flash |
| Agent, usage 3 | 0,050 USD | moyenne mesurée, 4 runs |
| GPU du Space (L4) | 0,80 USD par heure | tarif public Hugging Face [1] |
| Analyse vidéo d'une pièce sur le L4 | environ 17 s de calcul pour 30 images, plus 23 s de chargement après un réveil | `services/vision/README.md`, auto-test sur images de synthèse |

Hypothèse de travail : un diagnostic = 5 pièces filmées, 1 contrat, 3 contre-mesures confiées à l'agent, 1 absence.

- Agent : 0,081 + 3 × 0,033 + 0,050 = **0,23 USD**.
- GPU, temps de calcul seul : (5 × 17 s + 23 s) × 0,80 USD / 3 600 s = **0,024 USD**.
- GPU, Space réveillé pour ce seul diagnostic : il reste allumé 30 minutes après le dernier appel, soit jusqu'à **0,40 USD** de plus.

Ordre de grandeur, hors LLM et frais fixes : **0,25 à 0,65 USD par diagnostic**.

Non compté : les appels LLM (explication du plan avec `openai/gpt-oss-120b`, lecture du contrat avec `Qwen/Qwen2.5-72B-Instruct`, embeddings `BAAI/bge-m3`), dont la consommation n'a pas été relevée, et les abonnements fixes (Vercel, Supabase, n8n). Pendant le hackathon, les runs H sont couverts par l'offre gratuite (60 millions de tokens par mois) ; le coût en USD ci-dessus est celui que H calcule pour chaque session.

## Limites de ces mesures

- 4 runs par usage pour les usages 1 et 3 : le taux de 100 % n'a pas de valeur statistique.
- Les runs 1 à 12 et 13 à 40 ne suivent pas le même contrôle : les taux ne sont pas comparables d'un cadre à l'autre.
- Les temps « à la main » sont des estimations.
- Le premier run lancé depuis l'application (19/11, `chez-soi-acheteur:2`) n'est pas dans ce tableau : il a été mené jusqu'à la validation, mais l'agent a choisi un tapis de bain au lieu d'un sous-tapis. La consigne de session doit nommer la contre-mesure de l'action.

## Sources

[1] Hugging Face, « GPU Spaces », documentation du Hub, tableau des tarifs du matériel (1x Nvidia L4 : 0,80 USD par heure). [En ligne]. Disponible : https://huggingface.co/docs/hub/main/spaces-gpus (consulté le 19/11/2026).
