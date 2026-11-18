# n8n/

Les JSON de ce dossier sont la référence des workflows. Quand on modifie un workflow dans l'interface n8n, on fait un pull et on commite. On ne fait jamais de push sans prévenir Jean-Li (propriétaire des workflows sur l'instance) et Bastian (relecteur).

n8n **alimente** le graphe de connaissances ; l'application l'**interroge** (`POST /api/plan`).

## Commandes

Depuis la racine du dépôt, avec `N8N_URL` et `N8N_API_KEY` dans le `.env` (jamais affichées).

```bash
npm run n8n:pull
```

```bash
npm run n8n:push
```

```bash
npm run n8n:push -- --confirmer
```

```bash
npm run n8n:articles
```

- `n8n:push` est une simulation tant qu'on n'ajoute pas `-- --confirmer`.
- Méthode pour chaque modification : JSON dans le dépôt → push confirmé → pull → le diff doit être vide → commit.
- Un fichier désigne son workflow par l'`id` qu'il contient, pas par son nom. Sans `id`, le push crée le workflow et écrit l'`id` dans le fichier.
- Les workflows préfixés « archive · » sont ignorés partout. Ce sont les originaux de Bastian, conservés et désactivés sur l'instance.
- Le script n'active, ne désactive et n'exécute jamais un workflow. L'API publique de n8n ne permet pas de lancer une exécution : les tests se font dans l'interface.

## Fichiers

| Fichier | Rôle |
|---|---|
| `pipeline_analyse.json` | Vidéo du logement → service vision → table `failles` |
| `analyse_contrat.json` | Contrat PDF → service vision → `obligations_contrat`, nœuds `Clause`, arêtes `IMPOSE` |
| `veille_reglementaire.json` | Chaque lundi : Légifrance (PISTE) → règles au statut `proposee` → graphe après validation humaine |
| `articles_suivis.json` | Liste versionnée des textes suivis par la veille. Ce n'est pas un workflow |

Il n'y a pas de workflow `suivi_runs` : tous les webhooks H arrivent sur `/api/webhooks/hai` de l'application, qui écrit dans `runs_agent`.

## Configuration et sécurité

- **Aucun secret dans les JSON.** Les secrets vivent dans les credentials n8n ; seuls leur `id` et leur nom apparaissent ici.
- **Ni `$env` ni variables n8n.** `$env` est bloqué sur l'instance (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, volontairement) et les variables n8n ne sont pas disponibles en édition Community.
- **Nœud « Config »** (Set) en tête de chaque workflow : il porte les paramètres **non secrets**. On les modifie dans le JSON du dépôt, puis on pousse.

| Paramètre du nœud Config | Workflows | Valeur actuelle |
|---|---|---|
| `VISION_SERVICE_URL` | pipeline_analyse, analyse_contrat | `https://a-configurer.invalid` (provisoire) |
| `SUPABASE_URL` | les trois | `https://a-configurer.invalid` (provisoire) |
| `SUPABASE_BRANCHE` | les trois | `false` ; à passer à `true` quand les nœuds Supabase sont activés |
| `HF_EMBEDDING_URL` | analyse_contrat | endpoint `feature-extraction` de `BAAI/bge-m3` chez HF Inference Providers |
| `EMBEDDING_MODELE`, `EMBEDDING_DIMENSION` | analyse_contrat | `BAAI/bge-m3`, `1024` |
| `LEGIFRANCE_API_URL` | veille_reglementaire | `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app` |

| Credential n8n (compte de Jean-Li) | Type | Utilisé par |
|---|---|---|
| « Chez Soi · webhook » | Header Auth, en-tête `X-Chez-Soi-Secret` | les deux nœuds Webhook |
| « PISTE · Légifrance » | OAuth2 Client Credentials | les nœuds Légifrance de la veille |
| « Hugging Face · Inference » | Hugging Face API | le nœud d'embedding (désactivé) |
| Supabase (à créer après les migrations) | Supabase API | tous les nœuds « (Supabase) », désactivés |

Côté application, l'appel d'un webhook envoie l'en-tête `X-Chez-Soi-Secret` avec la valeur de `N8N_WEBHOOK_SECRET` (voir `.env.example`).

## Embeddings

Modèle **`BAAI/bge-m3`, dimension 1024**, via HF Inference Providers. La colonne est donc `graphe_noeuds.embedding vector(1024)` (migration `0005_graphe`, issue #1). Repli possible sur `intfloat/multilingual-e5-large`, de même dimension. Un vecteur d'une autre dimension est refusé par le workflow.

## Contrats d'entrée et de sortie

Les deux webhooks répondent toujours explicitement, avec un champ `statut`.

### pipeline_analyse · `POST /webhook/chez-soi/analyse-video`

Entrée :

```json
{ "logement_id": "<uuid>", "video_url": "<URL signée Supabase, https>" }
```

Appel du service vision : `POST {VISION_SERVICE_URL}/analyse` avec `{ logement_id, video_url }` et un en-tête `Idempotency-Key`.

| Réponse | `statut` | Quand |
|---|---|---|
| 200 | `ok` | Le service vision a renvoyé des failles. Corps : `logement_id`, `failles_retenues`, `failles_rejetees`, `ecrit_dans_supabase` |
| 202 | `analyse_en_cours` | Le service vision a accepté la demande (asynchrone) |
| 400 | `entree_invalide` | `logement_id` ou `video_url` manquant ou mal formé ; `video_id` et `document_id` sont refusés |
| 501 | `service_vision_non_implemente` | Le service vision n'est encore qu'un stub |
| 502 | `erreur_service_vision` | Service injoignable ou réponse inattendue |

**Suite asynchrone (18/11)** : le Space répond 202 avec son `analyse_id`. Après avoir répondu 202 à l'app, le workflow attend 20 s (« 08 »), lit `GET {VISION_SERVICE_URL}/analyse/{id}` (« 09 », credential « Chez Soi · vision Space »), recommence tant que `etat = en_cours` (au plus `ESSAIS_MAX` = 45 fois, soit 15 min), puis renvoie le résultat à l'app : `POST {APP_URL}/api/analyse/resultat` (« 11 », credential « Chez Soi · webhook », en-tête `X-Chez-Soi-Secret`) avec `{ analyse_id, logement_id, etat, resultat, service_analyse_id, failles, modele_3d_url, erreur }`. C'est l'app qui écrit `failles`, `analyses` et `pieces` : n8n n'a pas besoin de clé Supabase. L'entrée accepte en plus `analyse_id` (ligne `analyses` de l'app) et `piece`, tous deux facultatifs.

Réponse 200 attendue du service vision (**à valider avec la vision**) : `{ failles: [ { risque, element, piece, cote_estimee_cm, marge_cm, gravite, priorite, position_3d } ] }`, avec `risque` parmi `chute`, `intrusion`, `incendie`, `autre`.

Écriture : table `failles` (`id`, `logement_id`, `piece_id`, `risque`, `element`, `source = vision`, `cote_estimee_cm`, `marge_cm`, `gravite`, `priorite`, `position_3d`). `cote_confirmee_cm` n'est jamais écrite par n8n.

### analyse_contrat · `POST /webhook/chez-soi/analyse-contrat`

Entrée :

```json
{ "contrat_id": "<uuid>", "pdf_url": "<URL signée Supabase, https>" }
```

Appel du service vision : `POST {VISION_SERVICE_URL}/contrat` avec `{ contrat_id, pdf_url }` et un en-tête `Idempotency-Key`. Le PDF ne transite pas par n8n.

| Réponse | `statut` | Quand |
|---|---|---|
| 200 | `ok` | Extraction reçue. Corps : `contrat_id`, `assureur`, `formule`, `reference_cg`, `obligations_retenues`, `clauses_rejetees`, `noeuds`, `aretes`, `clauses_sans_regle`, `embeddings`, `ecrit_dans_supabase` |
| 202 | `extraction_en_cours` | Le service vision a accepté la demande (asynchrone) |
| 400 | `entree_invalide` | `contrat_id` ou `pdf_url` manquant ou mal formé |
| 501 | `service_vision_non_implemente` | Le service vision n'est encore qu'un stub |
| 502 | `erreur_service_vision` | Service injoignable ou réponse inattendue |

Réponse 200 attendue du service vision (**à valider avec la vision**) : `{ assureur, formule, reference_cg, obligations: [ { type, element, seuil, unite, texte_court, citation, clause, page, citation_retrouvee } ] }`, avec `type` parmi `prevention`, `inoccupation`, `exclusion`, `garantie`, `franchise`, `plafond`.

Règles appliquées :

- Une obligation sans `clause`, sans `page`, ou dont la citation n'a pas été retrouvée dans le PDF est **rejetée** et listée dans `clauses_rejetees`.
- Chaque obligation retenue devient un nœud `Clause` (clause, page, citation), privé : il porte le `contrat_id`.
- Une arête `IMPOSE` part de la clause vers chaque nœud `Règle` **validé** qui porte sur le même `element`. Une clause sans règle correspondante est listée dans `clauses_sans_regle` ; n8n ne crée aucune règle.
- `embeddings` vaut `calcules`, `non_calcules` ou `refuses` (vecteur absent ou d'une autre dimension).

Écritures : `obligations_contrat`, `graphe_noeuds`, `graphe_aretes`. L'usage 1 de l'agent H (conditions générales manquantes) est lancé par l'application à partir de `reference_cg`, jamais par n8n.

### veille_reglementaire · planifié, sans webhook

Déclenchement : chaque lundi à 09:00 (Europe/Paris) une fois activé, ou « Lancer à la main ».

Entrée : `articles_suivis.json`, dont le nœud « Articles suivis » porte une copie générée. Chaque entrée a une `cle`, une `reference`, une `recherche`, les `regles` Chez Soi concernées, son `rang_registre` et sa `priorite` (P1 ou P2 uniquement).

Lecture, par l'API Légifrance via PISTE et uniquement avec des appels décrits par la DILA : `POST /search`, puis `POST /consult/getArticle` (article) ou `POST /consult/legiPart` (texte entier). Aucun agent H.

Sortie : un bilan (`textes_suivis`, `lus`, `inchanges`, `modifies`, `premieres_lectures`, `non_compares`, `introuvables`, `ambigus`, `incoherents`, `sources_indisponibles`, `regles_proposees`, `changements_sans_regle`, `publication`).

Règles appliquées :

- La version enregistrée d'un texte est dans `graphe_noeuds.proprietes` du nœud `Article` (`cle`, `version`, `date_verification`, `url_legifrance`).
- Une version modifiée, ou lue pour la première fois, crée une **nouvelle** ligne `regles` au statut `proposee`, avec `source_ref`, `source_url`, `verifie_le` et `version + 1`. Une règle existante n'est jamais modifiée : les diagnostics passés gardent leur version.
- **Validation humaine bloquante** : le workflow ne passe jamais une règle à `validee`. La publication dans le graphe ne lit que les règles `validee`.
- Une recherche qui renvoie plusieurs résultats est classée `ambigu` et n'est jamais devinée.
- **Aucun identifiant Légifrance en dur**, ni dans la liste ni dans le workflow : chaque texte est retrouvé par recherche (numéro d'article, numéro de texte, NOR). L'identifiant que le Registre des sources donnait pour L113-2 renvoyait en réalité L113-8.
- Un article dont le numéro lu diffère du numéro demandé est classé `incoherent` et ne produit aucune règle.
- Les sources hors Légifrance (Service-Public, HAS, CNSA, normes AFNOR, A2P) restent en saisie manuelle dans `supabase/seed.sql`. Une statistique (P3) ne produit jamais de règle.

## Idempotence

- Appels au service vision : en-tête `Idempotency-Key` construit sur l'identifiant et le chemin du fichier, sans la signature de l'URL. Le service vision doit encore l'honorer.
- Écritures Supabase : identifiants déterministes et upsert (`on_conflict`). Rejouer un workflow réécrit les mêmes lignes, sans doublon et sans toucher aux champs confirmés par l'utilisateur.
- Règles proposées : insertion sans écrasement sur `(code, version)`, et pas de nouvelle proposition si la même version du texte a déjà été proposée.

## Tester dans l'interface

Rien n'est activé. Les tests se font nœud par nœud, avec des données fictives épinglées (« pin data »), sans appeler de service réel sauf mention contraire.

1. **Credential PISTE et recherche d'un article** : vérifiés le 17/11/2026 avec le nœud « Test PISTE · un seul appel ». L'API de production répond, et la recherche de L113-2 du Code des assurances par son numéro (`POST /search`) renvoie un seul résultat. Le workflow lit l'article dans `results[].sections[].extracts[]` (`id`, `num`, `dateVersion`). Restent à confirmer par une exécution : la lecture (`getArticle`, `legiPart`) et la recherche d'un texte entier.
2. **pipeline_analyse** : épingler sur « 01 · Logement et vidéo » un corps fictif `{ "body": { "logement_id": "11111111-2222-4333-8444-555555555555", "video_url": "https://exemple.test/video.mp4" } }`, puis exécuter dans l'ordre « 02 · Contrôler l’entrée », « Entrée valide ? », « 03 · Appeler le service vision » (attendu avec l'URL provisoire : service injoignable), « 04 · Interpréter la réponse », jusqu'à « Répondre 502 ». Refaire avec un corps invalide pour la branche 400.
3. **analyse_contrat** : même démarche avec `{ "body": { "contrat_id": "…", "pdf_url": "https://exemple.test/contrat.pdf" } }`. Pour la suite du flux, épingler sur « 03 · Appeler le service vision » une réponse fictive `{ "statusCode": 200, "body": { … } }` au format décrit plus haut, puis exécuter « 05 · Filtrer les clauses » et « 07 · Préparer le graphe ».
4. **Embeddings** : dans `analyse_contrat`, activer « 08 · Calculer les embeddings (HF) », l'exécuter sur la sortie de « 07 · Préparer le graphe », puis vérifier dans « 09 · Assembler les écritures » que `embeddings` vaut `calcules`.
5. **veille_reglementaire** : « Lancer à la main », puis lire « 14 · Bilan de la veille ». Chaque exécution fait jusqu'à 40 appels à l'API Légifrance. Sans Supabase, tous les textes lus sont `non_compares`.
6. **Supabase**, après les migrations : créer le credential, renseigner `SUPABASE_URL`, activer les nœuds « (Supabase) » un par un, passer `SUPABASE_BRANCHE` à `true`, puis faire un pull et commiter.

## Réveil du Space et nouveaux essais (18/11)

Le Space Hugging Face se met en veille après 30 min sans requête et met plusieurs minutes à redémarrer.

- `reveil_vision` (webhook `POST chez-soi/reveil-vision`, credential « Chez Soi · webhook ») : répond 202 tout de suite puis fait `GET /health` sur le Space (credential « Chez Soi · vision Space »). L'app l'appelle par `POST /api/vision/reveil` dès les écrans Contrat et Capture.
- `pipeline_analyse` répond **202 « vidéo reçue » dès que l'entrée est valide**, avant d'appeler le Space. Si le Space répond 503, 502, 404, 429 ou rien (démarrage), nouvel essai toutes les 20 s, jusqu'à `ESSAIS_REVEIL` (70) essais. Une autre erreur, un stub ou trop d'essais : l'échec est renvoyé à l'app par `POST /api/analyse/resultat` (`etat: "echec"`), qui affiche « analyse en échec, refilmez ».
- Délai maximal d'exécution du workflow : 3 600 s.

## Relecture de la PR #4

Le filtre exige une citation non vide et `citation_retrouvee === true` avant de
conserver une clause (valeur absente, null, false ou chaîne rejetée). La vision
conserve le nom `piece` pour le trigger Supabase introduit dans #16, sans écrire
la cote confirmée par l’utilisateur. Régressions locales, sans service externe :
`node --test scripts/n8n-clauses.test.mjs`. Les workflows restent désactivés ;
aucune synchronisation ni exécution sur l’instance pendant cette relecture.
