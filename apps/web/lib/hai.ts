/**
 * Client H Agents API. Squelette : constantes seulement, aucun appel réseau.
 * Circuit retenu (voir CLAUDE.md) : création de session, puis réponses aux outils
 * via le webhook `session.awaiting_tool_results`. Pas de SDK qui attend la session.
 */
export const HAI_BASE_URL = "https://agp.eu.hcompany.ai";
export const HAI_AGENT = "h/web-surfer-flash";
