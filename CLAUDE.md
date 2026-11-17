# Chez Soi · contexte pour Claude Code

> « Mieux, chez soi ! » · Team 2 · Hackathon Build The Future (H Company × Hugging Face × Vercel), Eugenia School, 16 au 20 novembre 2026.
> Ce fichier est lu au début de chaque session. Garde-le court et à jour : quand une décision change, mets-le à jour dans le même commit.

## Le produit en une phrase

Chez Soi transforme une vidéo du logement, plus le contrat d'assurance habitation si l'utilisateur le fournit, en plan de sécurité adapté aux occupants (intrusion et chutes). Un agent computer-use H Company prépare ensuite les actions. L'utilisateur s'engage toujours lui-même : connexion, paiement, envoi, signature.

Persona de démo : Marc, 52 ans, aidant de sa mère Jeanne, 79 ans, qui vit seule dans un T2 en rez-de-chaussée, se déplace avec une canne et part 35 jours cet hiver.

## Sources de vérité

1. **Architecture technique v3** (PDF de Briac, CTO, 17/11) : c'est la référence. Sa section 12 donne l'arborescence à jour.
2. Le PDF **Arborescence** est plus ancien (il est aligné sur la v2 : W1/W5/W6, Minecraft). Quand il diffère de la v3, c'est la v3 qui fait foi.
3. La section « Choix techniques (v4) » du Journal technique CTO **ne fait pas foi** (décision de Briac, 17/11 au soir).
4. Les règles de risque n'entrent dans `supabase/seed.sql` que si leur source P1 ou P2 est vérifiée et datée dans le **Registre des sources**.

Drive de l'équipe (pour les humains) : https://drive.google.com/drive/folders/1Iyf9o9B1I6Yu__epDEUB9142RcZD4DvB

## Architecture : 4 couches et un socle

| Couche | Rôle | Techno | Hébergement |
|---|---|---|---|
| Voir | Reconstruction 3D, cotes, détection des failles ; lecture du contrat | FastAPI, ffmpeg, OpenCV, modèle 3D (voir points ouverts), Grounding DINO ou OWLv2, open3d, trimesh, Docling, LLM + Pydantic | Space GPU Hugging Face (Docker) |
| Décider | Graphe de connaissances, profils, verdicts, contre-mesures | Postgres + pgvector (GraphRAG), TypeScript, LLM via HF Inference Providers, Vercel AI SDK, Zod | Vercel + Supabase |
| Agir | 3 usages de l'agent | H Agents API (`h/web-surfer-flash`), custom tools, skill maison, webhooks signés, pilotage en cours de run | Cloud H |
| Montrer | Parcours, plan 3D, validation, mode absence | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, three, @react-three/fiber, @react-three/drei | Vercel |
| Socle | Données, stockage, auth, orchestration | Supabase (Postgres, pgvector, Storage, Auth, RLS), n8n (workflows versionnés en JSON), GitHub | Supabase Cloud, n8n (`n8n.apps.joliment.fr`) |

### Les 3 usages de l'agent H

| Usage | Entrée | Ce que fait l'agent | Arrêt | Environnement |
|---|---|---|---|---|
| 1 · Sourcing | `get_contrat` (assureur, formule, réf. CG) | Retrouve les conditions générales sur le site de l'assureur et renvoie leur URL. Le backend télécharge le PDF puis le passe dans le pipeline contrat. | Lecture seule | Navigateur cloud, sans connexion |
| 2 · Objets | `get_mesures` (cotes confirmées, profil) | Compare les objets sur plusieurs sites, vérifie la dimension (skill `verifier_dimension`), met le produit compatible au panier | Panier affiché puis `demander_validation` | Navigateur cloud |
| 3 · Démarches | `get_contrat` (inoccupation), dates d'absence | Préremplit l'information de l'assureur et l'Opération tranquillité vacances | Avant envoi, `demander_validation` | Navigateur de l'utilisateur, connecté par lui (voir points ouverts) |

L'usage 1 ne tourne qu'en parcours A (avec contrat) et seulement si les conditions générales n'ont pas été déposées.

### Parcours A / B

- A, avec contrat : verdict dans l'ordre contrat, puis loi, puis recommandé.
- B, sans contrat : pas d'étape contrat ni d'usage 1 ; verdict loi puis recommandé ; en mode absence, OTV seule.

## Arborescence cible (v3, section 12)

```
chez-soi/
├── apps/web/                 Next.js 15, App Router, TypeScript → Vercel
│   ├── app/                  profil/ · logement/[id]/{capture,plan,actions,absence}/
│   │   └── api/              upload · contrat · plan · absence · agent/{run,steer,tools} · webhooks/hai
│   ├── components/           Viewer3D · PlanAction · SourceBadge · ContratUpload · ModeAbsence
│   │                         RunStatus · SteerInput · ValidationModal · ARButton
│   └── lib/                  hai.ts · supabase/ · graphe/ · risques/ · llm.ts · schemas.ts
├── agents/
│   ├── prompts/              u1_sourcing.md · u2_recommandation.md · u3_administratif.md
│   ├── schemas/tools/        get_mesures · get_contrat · demander_validation
│   ├── skills/               verifier_dimension.md
│   ├── workflows.ts
│   └── bench/                cas_u1.json · cas_u2.json · cas_u3.json · run_bench.py
├── services/vision/          FastAPI → Space GPU HF
│   ├── app.py · Dockerfile · requirements.txt
│   ├── pipeline/             frames · reconstruction · profondeur · detection · cotes · export
│   └── contrat/              lecture.py (Docling) · extraction.py · schema.py
├── supabase/migrations/      0001_schema · 0002_rls · 0003_regles · 0004_contrats · 0005_graphe (+ seed.sql)
├── n8n/                      pipeline_analyse · analyse_contrat · suivi_runs · veille_reglementaire (.json)
├── docs/                     architecture.md · mesures.md · regles.md
├── .env.example
└── README.md
```

## Routes API (apps/web)

| Route | Rôle |
|---|---|
| `POST /api/upload` | URL signée Supabase Storage (vidéo ou contrat) |
| `POST /api/contrat` | Déclenche `analyse_contrat`, renvoie l'état d'extraction |
| `POST /api/plan` | GraphRAG + règles + LLM explicatif → actions |
| `POST /api/absence` | Compare les dates au seuil d'inoccupation, prépare l'usage 3 |
| `POST /api/agent/run` · `GET ?id=` | Crée une session H (usage 1, 2 ou 3), lit son état |
| `POST /api/agent/steer` | Message envoyé à une session en cours (ex. « moins de 50 € ») |
| `POST /api/agent/tools` | Custom tools : `get_mesures`, `get_contrat`, `demander_validation` |
| `POST /api/webhooks/hai` | Webhooks signés H : vérification, mise à jour de `runs_agent` |

Service vision : `POST /analyse {logement_id, video_url}` et `POST /contrat {contrat_id, pdf_url}`. Les deux sont asynchrones ; n8n écrit les résultats dans Supabase.

## Custom tools (contrat d'interface)

```
get_mesures        { faille_id } → { element, piece, cote_confirmee_cm, largeur_cm, hauteur_cm, contraintes_profil: string[] }
get_contrat        { logement_id, champs: string[] } → { assureur, formule, reference_cg?, inoccupation?: { duree_max_jours, protections[], clause, page } }
                   Ne renvoie que les champs demandés, JAMAIS le PDF ni l'adresse.
demander_validation { action: "panier" | "envoi", resume, produit?, montant_eur?, url? } → { decision: "approuve" | "refuse" | "modifier", message? }
```

## Intégration H Agents API (à respecter)

- Les fonctions Vercel s'arrêtent vite, donc pas de SDK qui attend la session. Circuit retenu : une route crée la session (`POST /api/v2/sessions`) en déclarant les outils. Le webhook `session.awaiting_tool_results` arrive, la route lit `pending_tool_calls` puis répond via `tool_results`. Pour `demander_validation`, on ne répond qu'après le clic de l'utilisateur dans `ValidationModal`.
- Un appel d'outil peut être exécuté **deux fois** : chaque outil doit être idempotent.
- Webhooks : vérifier la signature, ignorer les doublons (même identifiant de livraison), répondre en moins de 10 s. L'URL doit être publique en https, c'est-à-dire le déploiement Vercel, pas localhost.
- Le bouton natif « Approve or deny » de H vise les commandes shell. L'arrêt avant un panier ou un envoi passe **uniquement** par `demander_validation`.
- Endpoint européen : `agp.eu.hcompany.ai`. Agent : `h/web-surfer-flash` (comparer avec `-pro` dans le banc).
- Résultat d'une session : `outcome` (success, partial, infeasible, blocked) ou `error_code`. Les deux vont dans `runs_agent`, puis dans l'onglet Mesures agent. L'outcome est une auto-évaluation : on vérifie la dimension nous-mêmes.
- Budget : **3 sessions simultanées** (offre gratuite). En démo, les usages sont enchaînés, jamais lancés en parallèle. Sous-agents (manager + 2) seulement si rien d'autre ne tourne. En développement : une session par personne au maximum, annoncée dans le canal de l'équipe.
- Figer la démo sur une révision d'agent (`nom:N`).

## Modèle de données (Supabase)

Tables de la v3 : `occupants`, `logements`, `contrats`, `obligations_contrat`, `absences`, `failles`, `actions`, `validations`, `runs_agent`, `regles`, `graphe_noeuds` (embedding pgvector), `graphe_aretes`.
Buckets privés : `videos`, `contrats`, `modeles3d`, `exports`. RLS : un utilisateur ne voit que son logement, son contrat et les nœuds du graphe liés à son contrat ; les nœuds publics (lois, règles, contre-mesures) sont lisibles par tous.
Le doc « CDO · Données et base » propose en plus `sources`, `regle_conditions`, `diagnostic_regles` et `declarations`, avec 12 règles de démo sourcées. Il faut les réconcilier avec la v3 avant d'écrire la migration 0001 (voir points ouverts).

## Règles non négociables

- **Aucun secret** dans le repo ni dans le Drive. `.env.example` ne contient que des noms de variables.
- **Arrêt garanti par le code, pas par le prompt** : `demander_validation` avant tout panier validé ou envoi de formulaire.
- **Pendant les tests : aucune vraie commande, aucun vrai formulaire envoyé** (OTV, assureur, artisans).
- Démo : personas et contrat **fictifs** uniquement.
- Profils de mobilité = données de santé (RGPD art. 9) : consentement explicite et daté, capacités fonctionnelles (déplacement 0 à 4, vue, audition, vigilance) plutôt que diagnostic.
- Extraction du contrat : un champ sans clause ni page retrouvées dans le PDF est **rejeté**. Le PDF ne va jamais à l'agent.
- Le verdict est calculé sur les nœuds Règle. **Le LLM explique, il ne modifie jamais le verdict** (sortie contrainte par Zod).
- Ordre du verdict : contrat (avec clause et page), puis loi (lien Légifrance), puis recommandé. Une référence du neuf reste « recommandé », jamais « obligation légale ».
- Conflit entre profils : la règle qui protège l'occupant le plus vulnérable s'applique par défaut.
- Aucun identifiant d'assureur ni FranceConnect chez l'agent.
- Licence : Depth Anything 3 « Nested » est CC BY-NC 4.0, donc à ne pas utiliser.

## Variables d'environnement (noms proposés)

`H_API_KEY`, `H_WEBHOOK_SECRET`, `HF_TOKEN`, `VISION_SERVICE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `N8N_URL`, `N8N_API_KEY`, `PISTE_CLIENT_ID`, `PISTE_CLIENT_SECRET`.

## Commandes

Pas de workspace racine : chaque partie s'installe dans son dossier. Gestionnaire de paquets : npm. Claude : mets cette section à jour quand tu ajoutes une commande.

**apps/web** (depuis `apps/web/`)

| Commande | Rôle |
|---|---|
| `npm install` | Installe les dépendances |
| `npm run dev` | Serveur de développement sur http://localhost:3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict) |
| `npm run build` | Build de production (à lancer avant chaque push) |
| `npm run start` | Sert le build de production |
| `npx shadcn@latest add <composant>` | Ajoute un composant shadcn/ui dans `components/ui/` |

**services/vision** (depuis `services/vision/`, Python 3.11 dans l'image)

| Commande | Rôle |
|---|---|
| `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` | Environnement local |
| `.venv/bin/uvicorn app:app --reload --port 7860` | Service en local (`/health`, `/analyse`, `/contrat`, doc sur `/docs`) |
| `docker build -t chez-soi-vision .` | Image du Space (pas encore construite ni testée) |
| `docker run --rm -p 7860:7860 chez-soi-vision` | Lance l'image en local |

**n8n** (depuis la racine, script `scripts/n8n-sync.mjs`, sans dépendance, Node 20.12 ou plus)

| Commande | Rôle |
|---|---|
| `npm run n8n:pull` | Exporte de l'instance vers `n8n/<nom>.json` les workflows qui ont déjà un fichier dans `n8n/` |
| `npm run n8n:pull -- <nom>` | Exporte en plus un workflow qui n'a pas encore de fichier |
| `npm run n8n:push` | Simulation : compare `n8n/*.json` à l'instance et affiche ce qui serait créé ou mis à jour, sans rien modifier |
| `npm run n8n:push -- --confirmer` | Envoie réellement vers l'instance. Jamais sans prévenir Bastian |

Variables nécessaires : `N8N_URL` et `N8N_API_KEY`, dans l'environnement ou dans le `.env` de la racine (ignoré par git). Le script ne les affiche jamais. Il passe par l'API publique n8n (`/api/v1/workflows`, en-tête `X-N8N-API-KEY`) ; il n'active, ne désactive et n'exécute aucun workflow. Le JSON exporté est stable : clés triées, sans `createdAt`, `updatedAt`, `versionId`, `staticData`, `pinData`, `shared`, `tags` ni `meta`. Le pull signale les secrets qui semblent écrits en dur (heuristique, à relire quand même). Les amorces vides (`nodes: []`) sont ignorées par le push.

**Pas encore de commande** : tests (aucun test écrit), déploiement du Space Hugging Face, déploiement Vercel, migrations Supabase (schéma non écrit, voir point ouvert 4), banc agent (`agents/bench/run_bench.py` est une amorce).

État du squelette : les routes API de `apps/web` et du service vision renvoient un stub typé en HTTP 501 (`StubReponse` dans `apps/web/lib/schemas.ts`, helper `apps/web/lib/stub.ts`).

## Conventions

- TypeScript strict. Schémas Zod partagés dans `apps/web/lib/schemas.ts`, Pydantic côté Python.
- Noms métier en français, en snake_case pour la base (`cote_confirmee_cm`, `runs_agent`…), comme dans la v3.
- Workflows n8n : les JSON de `n8n/` sont la référence. Quand on modifie un workflow dans l'interface, on fait un `npm run n8n:pull` et on commite. On ne fait jamais de push sans prévenir Bastian.
- Workflows n8n : aucun secret en dur dans les nœuds (en-têtes HTTP, paramètres, nœuds Code). On passe par un credential n8n ou une variable d'environnement ; seules les références de credentials (id et nom) apparaissent dans le JSON.
- Petits commits ciblés. Une session parallèle = un worktree.

## Git et GitHub (obligatoire, pour l'équipe comme pour Claude)

- **`main` est protégée** : pas de push direct ni de force-push. Tout passe par une pull request.
- **Une branche par sujet**, nommée `type/sujet-court`, en minuscules et avec des tirets : `feat/`, `fix/`, `supabase/`, `n8n/`, `ui/`, `vision/`, `agents/`, `docs/`, `chore/`. Exemple : `n8n/graphrag-piste`.
- **Une PR = un sujet**, liée à son issue (`Closes #N`), avec le modèle de PR rempli. Une PR trop grosse se découpe.
- **Avant d'ouvrir la PR** : `npm run lint`, `npm run typecheck` et `npm run build` dans `apps/web` si la PR y touche ; relire `git diff origin/main...HEAD` pour vérifier qu'aucun secret ni fichier `.env` n'y figure.
- **Fusion en squash uniquement.** Le titre de la PR devient le commit sur `main` : en français, à l'impératif, sans préfixe (« Ajoute le schéma Supabase »). La branche est supprimée automatiquement après la fusion.
- **Relecture** : Jean-Li par défaut ; Briac pour `supabase/`, `apps/` et `services/` ; Bastian pour `n8n/`. Vérifier la preview Vercel de la PR avant de fusionner.
- **En cas de conflit** : rebase de la branche sur `origin/main`, jamais de merge de `main` dans la branche.
- **Claude** : crée la branche au début de la session, commite par petites étapes, pousse la branche et ouvre la PR (`gh pr create`), puis donne le lien. **Ne fusionne jamais une PR toi-même** et ne pousse jamais sur `main`.
- **Suivi** : une tâche de code = une issue GitHub. Le tableau de Pilotage (Drive) reste le suivi d'équipe ; on y note le numéro d'issue.

## Priorités pour la démo de jeudi soir (proposition)

Chemin critique : schéma Supabase + seed, puis capture et upload, puis `/analyse` (avec un résultat 3D précalculé en plan B), puis `/api/plan`, puis usage 2 avec `demander_validation` et pilotage, puis `ValidationModal`, puis `runs_agent`.
Bonus, une fois le chemin critique tenu : usage 1, usage 3, AR, veille réglementaire, export Minecraft.
Plan B de la démo : run enregistré (replay H), 3D précalculée, partage de connexion.

## Points ouverts (ne pas trancher seul, demander)

1. **Modèles 3D** (VGGT + Depth Anything 3 dans la v3) : à confirmer par Jean-Li.
2. **Usage 3 dans le navigateur de l'utilisateur** : selon la doc H, l'environnement `user_device` ne passe que par le SDK Python ou la CLI, avec un Chrome dédié lancé avec un port de débogage, sans coffre-fort, et la session meurt si le programme Python s'arrête. Le circuit TS de la v3 ne suffit donc pas. Options : runtime Python local, agent `h/holotab`, ou navigateur cloud pour la démo. À trancher par Briac.
3. **Webhooks** : `awaiting_tool_results` doit arriver sur `/api/webhooks/hai` (l'app répond aux outils). Pour `completed`/`failed`, choisir entre la même route et n8n `suivi_runs` (qui n'existe pas encore). À trancher par Briac et Bastian.
4. **Schéma** : réconcilier la v3 et le doc CDO, et la table `pieces` proposée par le CPO (nom, debut_s, fin_s, qualité).
5. **Action montrée en live vendredi** : proposition du CPO, usage 2 « sous-tapis 60 × 160 cm » avec pilotage « moins de 50 € ». Décision de Jean-Li, mercredi midi.
6. Auth : Apple, Google ou lien par e-mail (proposition du CPO), plus un logement exemple avant l'inscription.
