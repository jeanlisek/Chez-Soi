# Chez Soi

> « Mieux, chez soi ! » · Team 2 · Hackathon Build The Future (H Company × Hugging Face × Vercel), Eugenia School, 16 au 20 novembre 2026.

Chez Soi transforme une vidéo du logement, plus le contrat d'assurance habitation si l'utilisateur le fournit, en plan de sécurité adapté aux occupants (intrusion et chutes). Un agent computer-use H Company prépare ensuite les actions. L'utilisateur s'engage toujours lui-même : connexion, paiement, envoi, signature.

**Démo** : https://chezsoi.vercel.app (un logement exemple, fictif, est visible sans compte).

Persona de démo, fictif : Marc aide sa mère Jeanne, 79 ans, qui vit seule en rez-de-chaussée et s'absente 35 jours cet hiver.

## Le parcours

1. **Profil** de l'occupant : capacités fonctionnelles (déplacement, vue, audition, vigilance), jamais de diagnostic, avec un consentement daté.
2. **Contrat** (facultatif) : le PDF est lu, chaque clause retenue garde sa citation et sa page. Une clause sans preuve dans le PDF est rejetée.
3. **Visite** : une vidéo par pièce. Le service vision reconstruit la pièce en 3D, repère les points de risque et estime leurs cotes.
4. **Plan d'action** : chaque point est confronté aux règles validées. Ordre du verdict : contrat (clause et page), puis loi, puis recommandation.
5. **Agent** : l'agent H compare des produits aux bonnes dimensions et s'arrête avant le panier. Rien ne part sans validation.
6. **Absence** : au-delà du seuil d'inoccupation du contrat, l'app prépare l'information de l'assureur et l'Opération tranquillité vacances, sans envoi.

## Où chaque technologie intervient

| Couche | Rôle | Technologie |
|---|---|---|
| Voir | Reconstruction 3D, cotes, détection ; lecture du contrat | Space GPU **Hugging Face** (FastAPI, modèles de vision), embeddings `BAAI/bge-m3` et LLM par HF Inference Providers |
| Décider | Règles, graphe de connaissances, verdict, explication | Postgres + pgvector (Supabase), TypeScript, **Vercel AI SDK**, Zod |
| Agir | Sourcing des conditions générales, achat d'objets, démarches | **H Company** Agents API, custom tools, skill maison, webhooks signés |
| Montrer | Parcours, vue 3D, validation, mode absence | Next.js 15 sur **Vercel**, Tailwind, three.js |
| Socle | Données, stockage, authentification, orchestration | Supabase (RLS sur toutes les tables), n8n |

## État au 18 novembre au soir

En production :

- connexion par lien e-mail, création du logement et du profil, design de l'équipe ;
- dépôt de la vidéo, analyse sur le Space (réveil automatique, nouveaux essais), failles et cotes en base ;
- plan d'action calculé sur les règles, avec le graphe pour reconnaître les éléments et une explication rédigée par un LLM puis contrôlée par du code ;
- lecture du contrat de bout en bout, testée avec des conditions particulières fictives ;
- mode absence.

En cours :

- l'agent H dans l'application (routes, validation, webhook) : en relecture ; l'agent tourne déjà en local, avec 25 runs mesurés ;
- conservation et affichage du modèle 3D de chaque pièce : en ligne, à tester sur une vraie vidéo ;
- usages 1 (conditions générales de l'assureur) et 3 (démarches avant une absence) de l'agent : en relecture.

Pas commencé : réalité augmentée, export Minecraft.

## Ce que le code garantit

- **Le LLM explique, il ne décide pas.** Le verdict vient des règles validées ; la sortie du modèle ne contient que le texte de l'explication, relu par un garde-fou (aucun chiffre inventé, pas de « obligatoire » pour une recommandation).
- **L'agent s'arrête avant tout engagement** : l'outil `demander_validation` et un coupe-circuit dans le code, pas seulement une consigne.
- **Le PDF du contrat ne va jamais à l'agent** ; il ne reçoit que les champs demandés.
- **Données de santé** : rien de ce qui décrit une personne ne part chez l'agent ni chez le LLM, seulement les contraintes sur l'objet.
- **Aucun secret dans le dépôt** ; données de démo fictives uniquement.

## Arborescence

| Dossier | Contenu |
|---|---|
| `apps/web/` | Application Next.js : écrans, routes API, calcul du plan (`lib/plan.ts`), graphe (`lib/graphe`), explication (`lib/llm.ts`) |
| `services/vision/` | Service FastAPI du Space : pipeline vidéo (`/analyse`) et lecture du contrat (`/contrat`) |
| `agents/` | Prompts, déclarations d'outils, skill `verifier_dimension`, banc de mesure et runs enregistrés |
| `supabase/` | Migrations 0001 à 0010, seed des règles et du graphe, tests SQL |
| `n8n/` | Workflows exportés : analyse vidéo, lecture du contrat, réveil du Space, veille réglementaire |
| `docs/` | Architecture, mesures, règles |

## Démarrer

```bash
cd apps/web && npm install && npm run dev
```

```bash
cd services/vision && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app:app --reload --port 7860
```

Les variables d'environnement sont listées dans [`.env.example`](.env.example) (noms uniquement). Le contexte complet, les commandes et les règles de travail sont dans [`CLAUDE.md`](CLAUDE.md) ; le détail par partie dans `supabase/README.md`, `n8n/README.md`, `agents/README.md` et `services/vision/README.md`.

## Équipe

Jean-Li Sek (CEO), Briac Turquety (CTO, CDO), Aurélie Périchon (CAIO), Bastian Bellard (CAO), Hoang-Kim Luong (CPO).
