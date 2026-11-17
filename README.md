# Chez Soi

> « Mieux, chez soi ! » · Team 2 · Hackathon Build The Future (H Company × Hugging Face × Vercel), novembre 2026.

Chez Soi transforme une vidéo du logement, plus le contrat d'assurance habitation si l'utilisateur le fournit, en plan de sécurité adapté aux occupants (intrusion et chutes). Un agent computer-use H Company prépare ensuite les actions ; l'utilisateur s'engage toujours lui-même.

Le contexte complet, les règles non négociables et les points ouverts sont dans [`CLAUDE.md`](CLAUDE.md).

## État

Squelette du monorepo : les pages sont vides, les routes API et le service vision renvoient un stub typé (HTTP 501). Aucune logique métier, aucun schéma SQL.

## Arborescence

| Dossier | Contenu |
|---|---|
| `apps/web/` | Next.js 15 (App Router, TypeScript strict, Tailwind, shadcn/ui) → Vercel |
| `services/vision/` | FastAPI (`/analyse`, `/contrat`) → Space GPU Hugging Face |
| `agents/` | Prompts, schémas d'outils, skill et banc de l'agent H |
| `supabase/` | Migrations (à écrire) et seed |
| `n8n/` | Workflows exportés en JSON |
| `docs/` | Architecture, mesures, règles |

## Démarrer

```bash
cd apps/web && npm install && npm run dev
```

```bash
cd services/vision && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app:app --reload --port 7860
```

Les variables d'environnement sont listées dans [`.env.example`](.env.example) (noms uniquement, aucun secret dans le dépôt).
