import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Explication d'une action par un LLM (Hugging Face Inference Providers, via le Vercel AI SDK).
 *
 * Règle non négociable : le LLM explique, il ne modifie jamais le verdict.
 * - Le verdict, la force (contrat, loi, recommandé) et la contre-mesure sont calculés avant, et
 *   ne font pas partie de la sortie : le schéma Zod ne contient que le texte de l'explication.
 * - Le texte est relu par du code (`explicationAcceptable`) : pas de chiffre absent des faits
 *   fournis, pas de vocabulaire d'obligation pour une simple recommandation. Sinon il est rejeté.
 * - Aucune donnée sur les occupants (âge, santé, mobilité : RGPD art. 9) n'est envoyée au modèle.
 * Sans `HF_TOKEN`, en cas d'erreur, de délai ou de rejet : `null`, et le plan garde son texte de règle.
 */

export const MODELE_LLM = process.env.LLM_MODELE ?? "openai/gpt-oss-120b";

const sortieSchema = z.object({
  explication: z.string().min(30).max(420).describe("Deux phrases au plus, en français, pour l'aidant."),
});

export type FaitsAction = {
  element: string;
  piece: string | null;
  mesure: string | null;
  seuil: string | null;
  verdict: "non_conforme" | "a_verifier";
  force: "contrat" | "loi" | "recommande" | "information";
  contre_mesure: string;
  regle: string | null;
  source: string | null;
  clause: { texte: string; reference: string; page: number } | null;
  /** Libellés tirés du graphe (contre-mesures, clauses, règles voisines). */
  contexte: string[];
};

const nombres = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

/** Garde-fou déterministe sur le texte produit. */
export function explicationAcceptable(texte: string, faits: FaitsAction): boolean {
  const connus = new Set(nombres(JSON.stringify(faits)));
  if (nombres(texte).some((n) => !connus.has(n))) return false;
  const obligation = /\b(obligatoire|obligation|la loi (impose|exige|oblige)|légalement|interdit|illégal|sanction|amende)\b/i;
  if (faits.force !== "loi" && faits.force !== "contrat" && obligation.test(texte)) return false;
  if (faits.force !== "contrat" && /\b(votre contrat|assureur|assurance)\b/i.test(texte)) return false;
  if (/\b(conforme aux normes|sans danger|aucun risque|garanti)\b/i.test(texte)) return false;
  // Constat « à vérifier » : la vidéo montre l'élément, pas son état. Le texte doit le dire,
  // et ne jamais affirmer un défaut qui n'a pas été constaté.
  if (faits.verdict === "a_verifier") {
    if (!/vérifi/i.test(texte)) return false;
    if (/\b(n[’']est pas|n[’']a pas|ne sont pas|n[’']ont pas|absence de|dépourvu|manque)\b/i.test(texte)) return false;
  }
  return true;
}

const LIBELLE_FORCE: Record<FaitsAction["force"], string> = {
  contrat: "exigé par le contrat d'assurance",
  loi: "obligation légale",
  recommande: "recommandation (ce n'est pas une obligation)",
  information: "information",
};

export async function expliquerAction(faits: FaitsAction): Promise<string | null> {
  const jeton = process.env.HF_TOKEN;
  if (!jeton) return null;
  try {
    const hf = createOpenAICompatible({
      name: "huggingface",
      baseURL: "https://router.huggingface.co/v1",
      apiKey: jeton,
      supportsStructuredOutputs: true,
    });
    const { output } = await generateText({
      model: hf(MODELE_LLM),
      output: Output.object({ schema: sortieSchema }),
      temperature: 0.2,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(12_000),
      system: [
        "Tu rédiges, pour une application de sécurité du logement, l'explication d'une action déjà décidée.",
        "Tu n'as aucun pouvoir sur la décision : le statut, la source et la contre-mesure sont fixés et tu ne les changes pas.",
        "Règles : français simple, vouvoiement, deux phrases au plus. Utilise seulement les faits fournis.",
        "N'invente aucun chiffre, aucune norme, aucune loi. Ne parle pas des habitants ni de leur santé.",
        "Si le statut est une recommandation, ne dis jamais que c'est obligatoire. Ne promets aucun résultat.",
        "Dis ce qui a été vu, pourquoi c'est un risque, et ce que l'action change. Cite la source telle qu'elle est donnée.",
        "Si le constat est « à vérifier sur place » : la vidéo a seulement repéré l'élément. N'affirme aucun défaut (ne dis pas qu'il n'est pas fixé, qu'il manque quelque chose). Écris qu'il faut vérifier, avec le mot « vérifier ».",
        "Parle à la deuxième personne (« votre tapis », « vous »), sans « nous ».",
      ].join("\n"),
      prompt: JSON.stringify({
        element: faits.element,
        piece: faits.piece,
        mesure_sur_la_video: faits.mesure,
        seuil_de_la_regle: faits.seuil,
        constat: faits.verdict === "non_conforme" ? "mesuré : ne respecte pas le seuil" : "à vérifier sur place (élément repéré, état inconnu)",
        statut: LIBELLE_FORCE[faits.force],
        action: faits.contre_mesure,
        regle: faits.regle,
        source: faits.source,
        clause_du_contrat: faits.clause,
        contexte_du_graphe: faits.contexte,
      }),
    });
    const texte = output.explication.trim();
    return explicationAcceptable(texte, faits) ? texte : null;
  } catch {
    return null;
  }
}
