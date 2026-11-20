"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Logement, Occupant } from "@/lib/domaine";

/**
 * État d'un parcours dans le navigateur : choix du profil, parcours A ou B, cotes confirmées,
 * missions confiées à l'agent, décision de validation. Pour le logement exemple, c'est tout
 * l'état ; pour un vrai logement, ces choix sont aussi écrits dans Supabase par les routes.
 * sessionStorage peut être absent ou plein : chaque accès est protégé.
 */
export type EtatParcours = {
  occupant: Occupant;
  parcours: "A" | "B";
  contratDepose: boolean;
  cotes: Record<string, { largeur_cm: number; longueur_cm: number; confirmee: boolean }>;
  missions: Record<string, "agent" | "moi">;
  run: "aucun" | "en_cours" | "proposition" | "termine";
  /** Vrai logement : session H en cours ou dernière session, créée par `/api/agent/run`. */
  sessionId?: string | null;
  decision: "approuve" | "refuse" | "modifier" | null;
  absenceJours: number;
  /** Session H de la recherche des conditions générales (usage 1), gardée si l'on quitte l'écran Contrat. */
  sessionCg?: string | null;
  /** Missions déjà lancées (une session H à la fois) : le bouton passe à la suivante. */
  lancees?: string[];
};

type ContexteParcours = {
  logement: Logement;
  etat: EtatParcours;
  maj: (partiel: Partial<EtatParcours>) => void;
  reinitialiser: () => void;
};

const Contexte = createContext<ContexteParcours | null>(null);

function etatInitial(logement: Logement): EtatParcours {
  const cotes: EtatParcours["cotes"] = {};
  for (const f of logement.failles) {
    if (f.cote) {
      cotes[f.id] = {
        largeur_cm: f.cote.largeur_cm,
        longueur_cm: f.cote.longueur_cm,
        confirmee: f.cote.statut === "confirmee",
      };
    }
  }
  const missions: EtatParcours["missions"] = {};
  for (const a of logement.actions) missions[a.id] = a.groupe === "plus_tard" ? "moi" : "agent";
  const jours = logement.absence
    ? Math.round(
        (Date.parse(logement.absence.retour_le) - Date.parse(logement.absence.depart_le)) / 86_400_000,
      )
    : 0;
  return {
    occupant: logement.occupant,
    parcours: logement.contrat ? "A" : "B",
    contratDepose: Boolean(logement.contrat),
    cotes,
    missions,
    run: "aucun",
    sessionId: null,
    decision: null,
    absenceJours: jours,
  };
}

function cle(id: string) {
  return `chez-soi:parcours:${id}`;
}

function lire(id: string): EtatParcours | null {
  try {
    const brut = window.sessionStorage.getItem(cle(id));
    return brut ? (JSON.parse(brut) as EtatParcours) : null;
  } catch {
    return null;
  }
}

function ecrire(id: string, etat: EtatParcours) {
  try {
    window.sessionStorage.setItem(cle(id), JSON.stringify(etat));
  } catch {
    /* stockage indisponible : l'état reste en mémoire */
  }
}

export function ParcoursProvider({ logement, children }: { logement: Logement; children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatParcours>(() => etatInitial(logement));

  useEffect(() => {
    const sauve = lire(logement.id);
    // Choix et cotes fusionnés : un état enregistré avant un recalcul du plan ne doit pas effacer les nouvelles actions.
    if (sauve) setEtat((e) => ({ ...e, ...sauve, missions: { ...e.missions, ...sauve.missions }, cotes: { ...e.cotes, ...sauve.cotes } }));
  }, [logement.id]);

  const maj = useCallback(
    (partiel: Partial<EtatParcours>) => {
      setEtat((e) => {
        const suivant = { ...e, ...partiel };
        ecrire(logement.id, suivant);
        return suivant;
      });
    },
    [logement.id],
  );

  const reinitialiser = useCallback(() => {
    const neuf = etatInitial(logement);
    ecrire(logement.id, neuf);
    setEtat(neuf);
  }, [logement]);

  const valeur = useMemo(() => ({ logement, etat, maj, reinitialiser }), [logement, etat, maj, reinitialiser]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useParcours(): ContexteParcours {
  const c = useContext(Contexte);
  if (!c) throw new Error("useParcours doit être utilisé sous ParcoursProvider");
  return c;
}
