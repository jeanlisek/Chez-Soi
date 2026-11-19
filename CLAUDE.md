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
| Voir | Reconstruction 3D, cotes, détection des failles ; lecture du contrat | FastAPI, OpenCV, MoGe-2, Grounding DINO, SAM 2.1, MapAnything (variante Apache), trimesh, Docling, LLM + Pydantic | Space GPU Hugging Face (Docker) |
| Décider | Graphe de connaissances, profils, verdicts, contre-mesures | Postgres + pgvector (GraphRAG), TypeScript, LLM via HF Inference Providers, Vercel AI SDK, Zod | Vercel + Supabase |
| Agir | 3 usages de l'agent | H Agents API (`h/web-surfer-flash`), custom tools, skill maison, webhooks signés, pilotage en cours de run | Cloud H |
| Montrer | Parcours, plan 3D, validation, mode absence | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, three, @react-three/fiber, @react-three/drei | Vercel |
| Socle | Données, stockage, auth, orchestration | Supabase (Postgres, pgvector, Storage, Auth, RLS), n8n (workflows versionnés en JSON), GitHub | Supabase Cloud, n8n (`n8n.apps.joliment.fr`) |

### Les 3 usages de l'agent H

| Usage | Entrée | Ce que fait l'agent | Arrêt | Environnement |
|---|---|---|---|---|
| 1 · Sourcing | `get_contrat` (assureur, formule, réf. CG) | Retrouve les conditions générales sur le site de l'assureur et renvoie leur URL. Le backend télécharge le PDF puis le passe dans le pipeline contrat. | Lecture seule | Navigateur cloud, sans connexion |
| 2 · Objets | `get_mesures` (cotes confirmées, profil) | Compare les objets sur plusieurs sites, vérifie la dimension (skill `verifier_dimension`), met le produit compatible au panier | Panier affiché puis `demander_validation` | Navigateur cloud |
| 3 · Démarches | dates d'absence, `get_contrat` (inoccupation) s'il y a un contrat | Préremplit l'information de l'assureur et l'Opération tranquillité vacances | Avant envoi, `demander_validation` | Navigateur de l'utilisateur, connecté par lui (voir points ouverts) |

L'usage 1 ne tourne qu'en parcours A (avec contrat) et seulement si les conditions générales n'ont pas été déposées.

L'usage 1 alimente le graphe de connaissances (v3, flux 7 et 8) : les lois arrivent par l'API PISTE, mais les conditions générales des assureurs n'ont pas d'API, c'est l'agent qui va les chercher. Le backend télécharge le PDF à l'URL renvoyée, vérifie lui-même la référence, puis le pipeline contrat l'ajoute au graphe (nœuds Clause). Décision de Jean-Li, 17/11 : l'usage 1 fait partie du chemin critique (#7).

### Parcours A / B

- A, avec contrat : verdict dans l'ordre contrat, puis loi, puis recommandé.
- B, sans contrat : pas d'étape contrat ni d'usage 1 ; verdict loi puis recommandé.
- Mode absence, pour tous (décision de Jean-Li, 18/11) : l'OTV et l'information de l'assureur sont toujours proposées. L'information de l'assureur est « exigée par le contrat » (clause et page) quand une clause d'inoccupation est dépassée, sinon « recommandée ».

## Arborescence cible (v3, section 12)

```
chez-soi/
├── apps/web/                 Next.js 15, App Router, TypeScript → Vercel
│   ├── app/                  profil/ · connexion/ · logement/[id]/{profil,contrat,capture,analyse,plan,faille/[failleId],actions,agent,agent/validation,absence,suivi}/
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
├── n8n/                      pipeline_analyse · analyse_contrat · veille_reglementaire (.json) · articles_suivis.json
├── scripts/                  n8n-sync.mjs (synchronisation repo ↔ n8n)
├── docs/                     architecture.md · mesures.md · regles.md
├── .env.example
└── README.md
```

## Routes API (apps/web)

| Route | Rôle |
|---|---|
| `POST /api/upload` · `POST /api/upload/termine` | URL signée Supabase Storage (vidéo ou contrat, 50 Mo au plus), puis enregistrement : pièce + ligne `analyses` + appel du webhook n8n `pipeline_analyse` (vidéo), ou ligne `contrats` (contrat) |
| `POST /api/analyse/resultat` | Retour de n8n `pipeline_analyse` quand le Space a fini (en-tête `X-Chez-Soi-Secret`) : l'app écrit `failles`, `analyses` et `pieces` (service_role, idempotent). n8n n'a donc pas de clé Supabase |
| `POST /api/vision/reveil` | Réveille le Space vision (en veille après 30 min) par le webhook n8n `reveil_vision`, dès l'écran Contrat ou Capture : il démarre pendant qu'on filme. Aucune clé Hugging Face côté Vercel |
| `POST /api/contrat` | Déclenche `analyse_contrat` (n8n → Space `/contrat`), écrit les clauses retenues (`obligations_contrat`, nœuds Clause, arêtes IMPOSE ; `lib/contrat.ts`) puis recalcule le plan. Service en veille : 202, l'écran relance |
| `POST /api/plan` | Recalcule le plan : failles + `regles_en_vigueur` + contrat → `actions` et `diagnostic_regles` (`lib/plan.ts`, verdict déterministe). Appelé aussi après chaque analyse, chaque profil et chaque lecture de contrat. Avec `HF_TOKEN` : GraphRAG (`lib/graphe` : embeddings bge-m3, `match_noeuds`, `sous_graphe`) pour reconnaître l'élément et nourrir l'explication, rédigée par un LLM (`lib/llm`, Vercel AI SDK, sortie Zod, garde-fou) ; sans lui, calcul par code d'élément et texte de règle |
| `POST /api/absence` | Compare les dates au seuil d'inoccupation, prépare l'usage 3 |
| `POST /api/analyse/modele-url` | n8n (`X-Chez-Soi-Secret`) : URL de dépôt signée pour copier le `.glb` d'une analyse dans `modeles3d` (`{user_id}/{logement_id}/{analyse_id}.glb`) avant la veille du Space |
| `POST /api/agent/run` · `GET ?id=` | Crée une session H (usage 1, 2 ou 3), lit son état |
| `POST /api/agent/steer` | Message envoyé à une session en cours (ex. « moins de 50 € ») |
| `POST /api/agent/tools` | Custom tools : `get_mesures`, `get_contrat`, `demander_validation` |
| `POST /api/webhooks/hai` | Tous les webhooks signés H (`awaiting_tool_results`, `completed`, `failed`) : vérification, écriture dans `runs_agent` |

Service vision : `POST /analyse {logement_id, video_url, piece?, pieces?}` répond 202 avec un `analyse_id` ; n8n lit ensuite `GET /analyse/{analyse_id}` (état, failles, liens du `.glb` et de l'image annotée), puis écrit dans Supabase. Avec `pieces` (nom, debut_s, fin_s), chaque pièce a sa propre reconstruction. Une cote que le pipeline ne peut pas mesurer (objet coupé par le cadre) est marquée « à confirmer » dans `position_3d.cote`, jamais écrite comme cote estimée. Si le calcul échoue, le service sert le résultat précalculé de `services/vision/precalcule/demo/` (`resultat: "precalcule"`) ; le dépôt étant public, seul `failles.json` y est suivi par git, jamais une image, un `.glb` ou une vidéo d'un vrai logement. `POST /autotest` est une route de diagnostic. `POST /contrat {contrat_id, pdf_url}` est synchrone : Docling, ou pypdf en secours (la réponse dit lequel dans `moteur` et pourquoi dans `repli` ; sur le Space, hors ligne, c'est pypdf jusqu'à la correction de Docling prévue après la démo), règles puis LLM facultatif via `HF_TOKEN` ; toute obligation dont la citation n'est pas retrouvée sur sa page est rejetée. Le Space `jeanlisek/chez-soi-vision` est privé : chaque appel porte `Authorization: Bearer <jeton Hugging Face>` et `X-Vision-Key`. Détail dans `services/vision/README.md`.

## Custom tools (contrat d'interface)

```
get_mesures        { faille_id } → { element, piece, cote_confirmee_cm, largeur_cm, hauteur_cm?, longueur_cm?, contraintes_profil: string[] }
                   Tapis : largeur_cm × longueur_cm au sol, hauteur_cm = épaisseur. contraintes_profil : contraintes concrètes sur l'objet, jamais l'âge ni la santé (RGPD art. 9).
get_contrat        { logement_id, champs: string[] } → { assureur, formule, reference_cg?, inoccupation?: { duree_max_jours, protections[], clause, page },
                         absence?: { type, element?, valeur?, unite?, texte, clause, page, source: "cg" | "cp" }[] }
                   Ne renvoie que les champs demandés, JAMAIS le PDF ni l'adresse.
demander_validation { action: "panier" | "envoi", resume, produit?, montant_eur?, url? } → { decision: "approuve" | "refuse" | "modifier", message? }
```

## Intégration H Agents API (à respecter)

- Les fonctions Vercel s'arrêtent vite, donc pas de SDK qui attend la session. Circuit retenu : une route crée la session (`POST /api/v2/sessions`) en déclarant les outils. Le webhook `session.awaiting_tool_results` arrive, la route lit `pending_tool_calls` puis répond via `tool_results`. Pour `demander_validation`, on ne répond qu'après le clic de l'utilisateur dans `ValidationModal`.
- Un appel d'outil peut être exécuté **deux fois** : chaque outil doit être idempotent.
- Webhooks : tous les événements H (`awaiting_tool_results`, `completed`, `failed`) arrivent sur `/api/webhooks/hai`, qui écrit dans `runs_agent`. Il n'y a pas de workflow n8n `suivi_runs` (décision de Jean-Li, 17/11 ; la v3 le prévoyait en section 10).
- Webhooks : vérifier la signature, ignorer les doublons (même identifiant de livraison), répondre en moins de 10 s. L'URL doit être publique en https, c'est-à-dire le déploiement Vercel, pas localhost.
- Le bouton natif « Approve or deny » de H vise les commandes shell. L'arrêt avant un panier ou un envoi passe **uniquement** par `demander_validation`.
- Vérifié dans la doc (hub.hcompany.ai, 17/11) : un custom tool se déclare `{ name, description, input_schema }`, sans schéma de sortie. Sur un agent du catalogue, les outils passent par `overrides["agent.tools"]` et la sortie structurée par `overrides["agent.answer_format"]` (JSON Schema). Chaque résultat renvoie le `tool_req` reçu, tel quel.
- À la limite de sessions, une création est mise en file (`queued`) et démarre seule plus tard : toujours créer avec `queue: false` et lire `GET /sessions/quota` avant.
- `GET /sessions/{id}/status` ne porte jamais la réponse finale : elle est dans `latest_answer` de `GET /sessions/{id}`. Un message envoyé à une session terminée la relance (et la refacture).
- **Pas de garde-fou natif sur une action du navigateur.** `demander_validation` n'est appelé que si l'agent suit le prompt. Ce que le code garantit : aucun identifiant, moyen de paiement ni adresse donnés à l'agent, refus par défaut, annulation après la validation, et le coupe-circuit de `agents/dev/boucle.ts`, qui annule la session dès qu'une page vue ou une action vise une page de commande, de paiement, de livraison, de connexion ou de compte (il réagit après coup, il n'empêche pas le clic). Côté application, le même coupe-circuit tourne dans `apps/web/lib/agent/serveur.ts` à chaque webhook (#12).
- Endpoint européen : `agp.eu.hcompany.ai`. Agent : `h/web-surfer-flash` (comparer avec `-pro` dans le banc).
- Résultat d'une session : `outcome` (success, partial, infeasible, blocked) ou `error_code`. Les deux vont dans `runs_agent`, puis dans l'onglet Mesures agent. L'outcome est une auto-évaluation : on vérifie la dimension nous-mêmes. Une valeur d'`outcome` hors de ces quatre s'écrit `null` (la colonne `runs_agent.outcome` la refuserait) et la valeur brute est gardée dans `observations_api.outcome_brut`. Conversion d'un run en ligne de `runs_agent` : `versLigneRunsAgent` (`apps/web/lib/runs_agent.ts`).
- Budget : **3 sessions simultanées** (offre gratuite). En démo, les usages sont enchaînés, jamais lancés en parallèle. Sous-agents (manager + 2) seulement si rien d'autre ne tourne. En développement : une session par personne au maximum, annoncée dans le canal de l'équipe.
- Figer la démo sur une révision d'agent (`nom:N`).

## Modèle de données (Supabase)

Schéma en place sur le projet Supabase `chez-soi` (organisation « Chez Soi », Paris, eu-west-3) : migrations `0001` à `0010` dans `supabase/migrations/`, détail dans `supabase/README.md` (issue #1).
Tables : `logements`, `pieces`, `occupants`, `declarations`, `absences`, `failles`, `actions`, `validations`, `runs_agent`, `sources`, `regles`, `regle_conditions`, `diagnostic_regles`, `contrats`, `obligations_contrat`, `elements`, `graphe_noeuds` (`embedding vector(1024)`, BAAI/bge-m3), `graphe_aretes`, `assureurs`, `analyses`, `messages_agent`, `webhooks_recus` (serveur uniquement). Vues : `regles_en_vigueur`, `elements_inconnus`. RPC : `match_noeuds`, `sous_graphe` ; réservées au serveur : `get_contrat_champs`, `valider_regle`.
Buckets privés : `videos`, `contrats`, `modeles3d`, `exports` (50 Mo par fichier sur l'offre gratuite), chemin `{user_id}/{logement_id}/…`. RLS sur toutes les tables : un utilisateur ne voit que son logement, son contrat et les nœuds du graphe liés à son contrat ; les nœuds publics (lois, règles, contre-mesures) sont lisibles par tout utilisateur connecté.
Le moteur de verdict lit `regles_en_vigueur`. Une nouvelle version de règle hérite des seuils et des conditions de la précédente ; seule une personne la valide (`valider_regle`). La table `elements` est le vocabulaire commun du champ `element` (vision, contrat, règles). Types TypeScript : `apps/web/lib/supabase/types.ts`.

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

`H_API_KEY`, `H_WEBHOOK_SECRET`, `HF_TOKEN` (aussi dans Vercel : embeddings et LLM de `/api/plan`), `LLM_MODELE` (facultatif, `openai/gpt-oss-120b` par défaut), `VISION_SERVICE_URL`, `VISION_API_KEY` (clé partagée entre n8n et le service vision, envoyée dans l'en-tête `X-Vision-Key`), `VISION_RECONSTRUCTION` (`1` pour activer MapAnything dans le service), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement), `N8N_URL`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET` (en-tête `X-Chez-Soi-Secret` des webhooks n8n), `PISTE_CLIENT_ID`, `PISTE_CLIENT_SECRET`.

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

**Agent H en local** (depuis `apps/web/`, qui porte `tsx` et `zod` ; scripts dans `agents/dev/`)

| Commande | Rôle |
|---|---|
| `npm run agent:u1 -- --assureur <maif\|altima>` | Lance UN run réel de l'usage 1 (conditions générales du contrat fictif de Jeanne, lecture seule). Après le run, le code télécharge le PDF dans `agents/bench/pdf/` (ignoré par git) et contrôle la référence ; le résultat va dans `controle_document` du run. `--a-blanc` n'envoie rien ; `--sans-url-depart` part d'une page vierge ; `--controler-url <url>` teste seulement le contrôle du PDF, sans session H |
| `npm run agent:u2 -- --site <domaine>` | Lance UN run réel de l'usage 2 (sous-tapis 60 × 160 cm, persona fictive) sur le site donné, arrêt au panier. Charge `../../.env` (`H_API_KEY`). À lancer dans un vrai terminal : `demander_validation` y pose la question (Entrée seule = refus). |
| `npm run agent:u2 -- --site <domaine> --a-blanc` | Affiche le corps de `POST /sessions` sans rien envoyer |
| `npm run agent:u3 -- --assureur <maif\|altima>` | Lance UN run réel de l'usage 3 (démarches avant les 35 jours d'absence de Jeanne, données fictives) : liens et récapitulatif OTV et assureur, arrêt sur `demander_validation` (`envoi`), **rien n'est envoyé**, aucune connexion. `--a-blanc` n'envoie rien à H ; `--verifier-absence` affiche seulement le calcul de `/api/absence` |
| `npm run agent:recontroler` | Repasse le contrôle de sortie sur les runs de `agents/bench/runs/`, sans appeler H. Lecture seule ; `-- --ecrire` met à jour les champs dérivés (`schema_valide`, `erreurs_schema`, `ecarts_metier`), jamais les données brutes de l'agent |
| `npm run agent:skill -- ../../agents/skills/verifier_dimension.md` | Affiche le corps de `POST /skills` (à blanc) ; `--publier` crée la skill sur H (révision 1), `--publier --mettre-a-jour` en publie une nouvelle révision, sans lancer de session. Organisation de l'équipe : `verifier-dimension:2` (19/11, cotes au sol `largeur_cm` × `longueur_cm`), portée par `chez-soi-acheteur:2` |
| `npm run agent:creer -- ../../agents/definitions/chez-soi-acheteur.json` | Affiche le corps de l'agent maison (à blanc) ; `--publier` le crée sur H, `--publier --mettre-a-jour` en fait une nouvelle révision. Sans session. Créé le 18/11 : `chez-soi-acheteur:1` (base `h/web-surfer-flash` + skill `verifier-dimension:1`). Run : `npm run agent:u2 -- --site <domaine> --agent chez-soi-acheteur:1` |
| `npm run typecheck:agents` | `tsc --noEmit` sur `agents/dev/` (`tsconfig.agents.json`, hors du build Next) |

Depuis un worktree (pas de `.env` à sa racine) : `npx tsx --env-file=$HOME/Documents/Chez-Soi/.env ../../agents/dev/run_u2.ts --site <domaine>`. Options : `--agent <nom[:N]>` (`chez-soi-acheteur:1` pour la skill `verifier-dimension`), `--malgre-sessions-actives`. Chaque run est écrit dans `agents/bench/runs/AAAA-MM-JJ_u2_<session>.json`, sans `agent_view_url`. `schema_valide` dit si la réponse respecte le schéma Zod (`null` et chaîne vide valent « absent ») ; `ecarts_metier` liste ce qu'il reste à vérifier. Une session par lancement, jamais de relance automatique ; annoncer le run dans le canal.

**services/vision** (depuis `services/vision/`, Python 3.11 installé par `uv`)

| Commande | Rôle |
|---|---|
| `uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt` | Environnement local (dépendances et tests) |
| `uv pip install --python .venv/bin/python --no-deps -r requirements-modeles.txt` | Code des modèles (MoGe), installé sans ses dépendances superflues |
| `.venv/bin/python -m pytest -q` | Tests (sans modèle ni réseau) |
| `.venv/bin/python -m pipeline --video donnees/<vidéo> --sortie sorties/<nom> --piece <pièce>` | Analyse locale d'une vidéo : `failles.json`, `image_annotee.jpg`, `modele.glb`. Options : `--pieces <fichier.json>` (découpage par pièce, une reconstruction par pièce), `--images <dossier>`, `--nb-images`, `--calibrer-a4`, `--reconstruction` (MapAnything : `.glb` de tout ce qui est filmé), `--presence` (serrures, détecteurs… peu fiable en basse définition) |
| `.venv/bin/uvicorn app:app --reload --port 7860` | Service en local (`/health`, `/analyse`, `/contrat`, doc sur `/docs`) |
| `.venv/bin/python -m pipeline.autotest` | Auto-test : charge les quatre modèles et les fait tourner sur des images de synthèse, avec les durées par modèle (même test que `POST /autotest` sur le Space) |
| `.venv/bin/python -m tests.donnees.generer_conditions_particulieres_fictives` | Régénère les conditions particulières FICTIVES de Jeanne (`tests/donnees/`) : document nu, mention « DOCUMENT FICTIF » sur chaque page, avec l'assureur, la formule, la référence des CG et deux clauses inventées, page 1 : inoccupation (30 jours) et serrure à trois points |
| `.venv/bin/python -m pipeline.precision --failles sorties/<nom>/failles.json --verite donnees/verite.json` | Mesure de précision : écart en cm et en % avec les dimensions relevées au mètre ruban |
| `docker build -t chez-soi-vision .` | Image du Space, poids des modèles compris (environ 7,4 Go de poids). Si le téléchargement échoue sur « CAS Client Error », ajouter `--build-arg HF_HUB_DISABLE_XET=1` |
| `.venv/bin/python -m pytest tests/test_contrat.py` | Tests de la lecture du contrat (PDF fictif généré, `reportlab` requis pour le test) |
| `docker run --rm -p 7860:7860 chez-soi-vision` | Lance l'image en local |
| `.venv/bin/python deployer_space.py --space <compte>/<nom>` | Simulation du déploiement sur le Space Hugging Face : n'envoie rien |
| `.venv/bin/python deployer_space.py --space <compte>/<nom> --confirmer` | Envoie le service sur le Space (privé). `--materiel l4x1` demande un GPU payant : jamais sans l'accord de Jean-Li |

**n8n** (depuis la racine, script `scripts/n8n-sync.mjs`, sans dépendance, Node 20.12 ou plus)

| Commande | Rôle |
|---|---|
| `npm run n8n:pull` | Exporte de l'instance vers `n8n/<nom>.json` les workflows qui ont déjà un fichier dans `n8n/` |
| `npm run n8n:pull -- <nom>` | Exporte en plus un workflow qui n'a pas encore de fichier |
| `npm run n8n:push` | Simulation : compare `n8n/*.json` à l'instance et affiche ce qui serait créé ou mis à jour, sans rien modifier |
| `npm run n8n:push -- --confirmer` | Envoie réellement vers l'instance. Jamais sans prévenir Jean-Li et Bastian |
| `npm run n8n:articles` | Régénère dans `veille_reglementaire` la copie de `n8n/articles_suivis.json` (à lancer après toute modification de la liste) |

Variables nécessaires : `N8N_URL` et `N8N_API_KEY`, dans l'environnement ou dans le `.env` de la racine (ignoré par git). Le script ne les affiche jamais. Il passe par l'API publique n8n (`/api/v1/workflows`, en-tête `X-N8N-API-KEY`) ; il n'active, ne désactive et n'exécute aucun workflow. L'API publique ne permet pas de lancer une exécution : les tests se font dans l'interface.

Ciblage : un fichier `n8n/<nom>.json` désigne son workflow par l'`id` qu'il contient, pas par son nom. Sans `id`, le push crée le workflow puis écrit l'`id` dans le fichier. Les workflows préfixés « archive · » (originaux de Bastian, conservés) sont ignorés partout. Le JSON exporté est stable : clés triées, sans `createdAt`, `updatedAt`, `versionId`, `staticData`, `pinData`, `shared`, `tags` ni `meta`. Le pull signale les secrets qui semblent écrits en dur (heuristique, à relire quand même). Le push échoue si le nœud « Articles suivis » ne correspond plus à `n8n/articles_suivis.json`.

**supabase** (depuis la racine, CLI Supabase v3 via `npx` ; sous PowerShell, `npx.cmd` si les scripts sont bloqués ; `DATABASE_URL` et le mot de passe de la base sont dans le coffre-fort). Depuis la v3, les commandes visent la base locale par défaut : `--remote` vise le projet relié. Le Wi-Fi de l'école bloque le port 5432 : commandes `--remote` et `psql` depuis un partage de connexion. Historique des migrations aligné le 18/11 (0001 à 0007 marquées appliquées).

| Commande | Rôle |
|---|---|
| `npx supabase login` puis `npx supabase link --project-ref hfcunqjqmtlozhiwfihl` | Relie le dépôt au projet `chez-soi` (`supabase/config.toml` est versionné) |
| `npx supabase migration list --remote` | Compare les migrations du dépôt à l'historique du projet |
| `npx supabase db push --remote --dry-run`, puis sans `--dry-run` | Applique les migrations manquantes (une migration appliquée ne se modifie jamais) |
| `psql "$DATABASE_URL" -f supabase/seed.sql` | Référentiel : sources, règles, graphe public (rejouable) |
| `psql "$DATABASE_URL" -f supabase/tests/rls_test.sql` | Test RLS, annulé à la fin (attendu : « RLS OK ») |
| `psql "$DATABASE_URL" -f supabase/tests/graphe_test.sql` | Test du graphe et des raccordements, annulé à la fin (attendu : « GRAPHE OK ») |
| `npx supabase gen types typescript --remote > apps/web/lib/supabase/types.ts` | Régénère les types après chaque migration (Windows PowerShell 5 : `\| Out-File -Encoding utf8 …`, car `>` y écrit en UTF-16) |

**Pas encore de commande** : tests de `apps/web` (seuls les tests SQL et ceux du service vision existent), déploiement Vercel, banc agent (`agents/bench/run_bench.py` est une amorce ; les runs locaux de `agents/dev/` écrivent déjà dans `agents/bench/runs/`, le banc Flash/Pro est dans la PR #32). Les résultats des 40 runs réels se recalculent avec `python3 scripts/resultats.py` (`docs/resultats.md`, `docs/resultats_runs.csv`).

État des routes (19/11) : toutes les routes API de `apps/web` sont écrites ; le helper de stub (`StubReponse` dans `apps/web/lib/schemas.ts`, `apps/web/lib/stub.ts`) n'est plus appelé. Les trois usages de l'agent sont branchés (#86 pour l'usage 3). Le client `apps/web/lib/hai.ts` est écrit (issue #5). Les routes `/api/agent/*` et `/api/webhooks/hai` l'utilisent (issue #12, `apps/web/lib/agent/`) :
- `POST /api/agent/run` crée la session sur l'agent maison figé (`nom:N`) et écrit `runs_agent` ;
- `/api/webhooks/hai` vérifie la signature (`H_WEBHOOK_SECRET`), ignore les doublons (`webhooks_recus`) et répond tout de suite ; ensuite (`after()`), il relit `/changes` pour appliquer le coupe-circuit, répondre à `get_mesures` et `get_contrat`, enregistrer `demander_validation` dans `validations`, et compléter `runs_agent` en fin de session ;
- `POST /api/agent/tools` envoie à H la décision de l'utilisateur sur `demander_validation` ;
- `POST /api/agent/steer` envoie une consigne et la journalise dans `messages_agent`.

Usages 1 et 2 dans `lib/agent/usages.ts` (agent maison figé, page de départ et tâche préparées depuis la base, évaluation de la réponse) ; l'usage 3 y est depuis #86 (agent `chez-soi-demarches:1`, dates lues dans `absences`, arrêt sur `demander_validation`, action « envoi »). Usage 1, sans action, en fin de session (`lib/agent/contrat_cg.ts`) : PDF téléchargé sur les domaines officiels de l'assureur (`assureurs.domaines`), référence vérifiée par le code, PDF rangé dans le bucket `contrats` (`{user_id}/{logement_id}/cg_…`), colonnes `cg_*` du contrat renseignées. La lecture des clauses des CG n'est pas encore lancée : `enregistrerExtraction` (`lib/contrat.ts`) écrit `source: "cp"` et retire les clauses d'une lecture précédente. Le webhook H est déclaré au niveau de l'organisation (`POST /api/v2/webhooks`, événements `session.awaiting_tool_results`, `session.completed`, `session.failed`, `session.timed_out`, `session.status_updated`), sur l'URL de **production** : une preview protégée renvoie 401. Le secret `whsec_…` n'est montré qu'une fois et va dans `H_WEBHOOK_SECRET` (Vercel).

Interface (18/11) : les 12 écrans de la maquette (Figma « Chez soi · Parcours utilisateurs et écrans ») sont codés dans `apps/web`. Le logement `exemple` (Marc et Jeanne, fictifs) tourne sans compte ni API : données dans `lib/demo/logement-exemple.ts`, état du parcours dans `lib/demo/etat.tsx` (sessionStorage). Design (18/11) : celui du dépôt de Hoang-Kim `quelquunseeulement/chez-soi-app`, fidèle au Figma. Tokens dans `app/globals.css` (pervenche, nuit, lilas, crème, cobalt ; signaux info, succès, attention, danger, veille), composants dans `components/cs/` (`ui.tsx`, `icons.tsx`, `Inscription.tsx`), polices Inter, Boldonse et Karumbi et 11 illustrations dans `public/` (le build n'appelle pas Google Fonts). Règles de la charte : rouge = danger physique uniquement, un signal porte couleur + forme + mot, boutons d'action en bleu nuit. Connexion (18/11) : Supabase Auth, Google et lien par e-mail (`/connexion`, retour `/auth/callback`, puis `/mon-logement` qui ouvre ou crée le logement de l'utilisateur). Les vrais logements sont lus par `lib/donnees.ts` sous RLS ; le profil s'enregistre par une action serveur (`app/logement/[id]/actions-serveur.ts`).

## Conventions

- TypeScript strict. Schémas Zod partagés dans `apps/web/lib/schemas.ts`, Pydantic côté Python.
- Noms métier en français, en snake_case pour la base (`cote_confirmee_cm`, `runs_agent`…), comme dans la v3.
- Workflows n8n : les JSON de `n8n/` sont la référence. Quand on modifie un workflow dans l'interface, on fait un `npm run n8n:pull` et on commite. On ne fait jamais de push sans prévenir Jean-Li (propriétaire des workflows sur l'instance) et Bastian (relecteur de `n8n/`).
- Workflows n8n : aucun secret en dur dans les nœuds (en-têtes HTTP, paramètres, nœuds Code). Les secrets passent par un credential n8n ; seules les références de credentials (id et nom) apparaissent dans le JSON. `$env` est bloqué sur l'instance et les variables n8n sont indisponibles (édition Community) : les paramètres non secrets vivent dans le nœud « Config » de chaque workflow.
- Workflows n8n : chaque webhook exige Header Auth (credential « Chez Soi · webhook », en-tête `X-Chez-Soi-Secret`). Les nœuds Supabase restent désactivés jusqu'aux migrations de l'issue #1. Entrées, sorties et ordre de test : `n8n/README.md`.
- Graphe : n8n l'alimente, l'app l'interroge (`/api/plan`). Embeddings `BAAI/bge-m3`, dimension 1024 (`embedding vector(1024)`). La veille Légifrance ne crée que des règles au statut `proposee` ; seule une règle passée à `validee` par une personne entre dans le graphe.
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
- **Exception (décision de Jean-Li, 18/11)** : pour les PR de l'application (`apps/web`) ouvertes par Claude, Claude fusionne lui-même une fois `lint`, `typecheck`, `build` et la preview Vercel vérifiés, puis prévient Jean-Li ; Briac relit après coup. Rien d'autre ne change : jamais de push sur `main`, jamais de fusion de la PR de quelqu'un d'autre sans accord.
- **Suivi** : une tâche de code = une issue GitHub. Le tableau de Pilotage (Drive) reste le suivi d'équipe ; on y note le numéro d'issue.

## Priorités pour la démo de jeudi soir (proposition)

Chemin critique : schéma Supabase + seed, puis capture et upload, puis `/analyse` (avec un résultat 3D précalculé en plan B), puis `/api/plan`, puis usage 2 avec `demander_validation` et pilotage, puis `ValidationModal`, puis `runs_agent`, puis usage 1 (conditions générales de l'assureur → graphe, #7).
Bonus, une fois le chemin critique tenu : usage 3, AR, veille réglementaire, export Minecraft.
Plan B de la démo : run enregistré (replay H), 3D précalculée, partage de connexion.

## Points ouverts (ne pas trancher seul, demander)

1. **Modèles 3D** : tranché par Jean-Li le 18/11. MoGe-2, Grounding DINO base, SAM 2.1 et MapAnything (variante Apache) ; DA3-BASE et DA3METRIC-LARGE en secours ; VGGT abandonné (licence). Révisions et licences figées dans `services/vision/modeles.py`. MapAnything tourne aussi sur le GPU Apple, mais sa reconstruction n'est pas fiable sur une visite rapide de plusieurs pièces (voir `docs/mesures.md`) ; les cotes n'en dépendent pas.
2. **Usage 3 dans le navigateur de l'utilisateur** : selon la doc H, l'environnement `user_device` ne passe que par le SDK Python ou la CLI, avec un Chrome dédié lancé avec un port de débogage, sans coffre-fort, et la session meurt si le programme Python s'arrête. Le circuit TS de la v3 ne suffit donc pas. Options : runtime Python local, agent `h/holotab`, ou navigateur cloud pour la démo. À trancher par Briac.
3. ~~**Webhooks**~~ : **tranché** (Jean-Li, 17/11). Tous les webhooks H arrivent sur `/api/webhooks/hai`, qui écrit dans `runs_agent`. Le workflow n8n `suivi_runs` est abandonné.
4. **Schéma** : tranché le 18/11 (issue #1). v3 et doc CDO réconciliés, `pieces` et `declarations` retenues, vocabulaire `elements` commun ; détail dans `supabase/README.md`.
5. ~~**Action montrée en live vendredi**~~ : **tranché** (Jean-Li, 18/11). Usage 2 « sous-tapis antidérapant 60 × 160 cm » pour le tapis de Jeanne, avec le pilotage « moins de 50 € ». Bastian continue jusqu'à vendredi pour obtenir un panier entièrement validé sur ce cas. Plan B : son run 35 (pilotage « point relais uniquement », arrêt et `demander_validation` sans ajout au panier, replay K36 dans Mesures agent).
6. Auth : Apple, Google ou lien par e-mail (proposition du CPO), plus un logement exemple avant l'inscription.


Relecture n8n #4 : `node --test scripts/n8n-clauses.test.mjs` contrôle le rejet
des clauses sans citation vérifiée et la conservation de `piece` pour le trigger
Supabase (#16). Aucune requête externe dans ces tests.
