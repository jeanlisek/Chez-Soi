# agents/

Prompts, schémas d'outils, skill et banc de mesure de l'agent H. Tout est à l'état d'amorce.

- `schemas/tools/` reprend le contrat d'interface du `CLAUDE.md`, en JSON Schema neutre. Le format exact de déclaration attendu par H Agents API reste à vérifier dans sa documentation.
- Les mêmes schémas existent en Zod dans `apps/web/lib/schemas.ts` : toute modification se fait des deux côtés.
