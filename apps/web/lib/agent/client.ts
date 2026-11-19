"use client";

import { useEffect, useState } from "react";

/** Réponse de `GET /api/agent/run?id=` (`lireRun`) : ligne `runs_agent` et validation en attente. */
export type EtatRun = {
  run: {
    session_id: string;
    usage: number;
    agent: string | null;
    statut_final: string | null;
    outcome: string | null;
    motif_fin: string | null;
    nb_etapes: number | null;
    sortie_finale: Record<string, unknown> | null;
    decision_validation: string | null;
    coupe_circuit: unknown;
  };
  validation_en_attente: { id: string; resume: string | null } | null;
};

const TERMINAUX = ["completed", "failed", "timed_out", "interrupted", "cancelled", "canceled"];

export function runTermine(etat: EtatRun | null): boolean {
  return Boolean(etat?.run.statut_final && TERMINAUX.includes(etat.run.statut_final));
}

/**
 * Suit une session H par `GET /api/agent/run?id=` toutes les 3 s tant qu'elle n'est pas
 * terminée. Chaque lecture relit aussi la session chez H côté serveur : c'est ce qui garde le
 * coupe-circuit actif pendant que l'agent attend la validation.
 */
export function useRunAgent(sessionId: string | null | undefined): { etat: EtatRun | null; erreur: string | null } {
  const [etat, setEtat] = useState<EtatRun | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let arrete = false;
    let minuteur: number | undefined;
    const lire = async () => {
      try {
        const r = await fetch(`/api/agent/run?id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (arrete) return;
        if (!r.ok) {
          setErreur(r.status === 404 ? "Session introuvable." : "Le suivi de l'agent est momentanément indisponible.");
        } else {
          const donnees = (await r.json()) as EtatRun;
          if (arrete) return;
          setErreur(null);
          setEtat(donnees);
          if (runTermine(donnees)) return;
        }
      } catch {
        if (!arrete) setErreur("Le suivi de l'agent est momentanément indisponible.");
      }
      if (!arrete) minuteur = window.setTimeout(lire, 3000);
    };
    void lire();
    return () => {
      arrete = true;
      if (minuteur) window.clearTimeout(minuteur);
    };
  }, [sessionId]);

  return { etat: sessionId ? etat : null, erreur: sessionId ? erreur : null };
}

/**
 * Le résumé enregistré par `demander_validation` : « résumé · produit · 9.99 € · lien ».
 * On en retire le montant et le lien pour l'affichage ; le reste est montré tel quel.
 */
export function lireResume(resume: string | null | undefined): { texte: string; produit: string | null; montant_eur: number | null } {
  const morceaux = (resume ?? "").split(" · ").map((m) => m.trim()).filter(Boolean);
  let montant: number | null = null;
  const textes: string[] = [];
  for (const m of morceaux) {
    const prix = /^(\d+(?:[.,]\d+)?) €$/.exec(m);
    if (prix) montant = Number(prix[1].replace(",", "."));
    else if (!/^https?:\/\//.test(m)) textes.push(m);
  }
  return { texte: textes[0] ?? "", produit: textes.length > 1 ? textes[textes.length - 1] : null, montant_eur: montant };
}
