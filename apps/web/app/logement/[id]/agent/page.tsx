"use client";

import { useEffect, useState } from "react";
import { Menu, MousePointer2 } from "lucide-react";

import { RunStatus } from "@/components/RunStatus";
import { SteerInput } from "@/components/SteerInput";
import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { Bouton, BoutonRond, Corps, Ecran, EnTete, Pied } from "@/components/chez-soi/ui";
import { ETAPES_AGENT_EXEMPLE } from "@/lib/demo/logement-exemple";
import { useParcours } from "@/lib/demo/etat";

/**
 * Écran 9 · Agent. Logement exemple : replay du run réel du 18/11 (IKEA France, PR #9),
 * sans session H. Vrai logement : session créée par `/api/agent/run`, suivie par webhook.
 */
export default function PageAgent() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const cote = etat.cotes["tapis-couloir"];
  const etapes = [
    `Cote lue dans votre plan : ${cote?.largeur_cm ?? 60} × ${cote?.longueur_cm ?? 160} cm`,
    ...ETAPES_AGENT_EXEMPLE.slice(1),
  ];
  const [franchies, setFranchies] = useState(etat.run === "en_cours" ? 0 : etat.run === "aucun" ? 0 : etapes.length);
  const [consignes, setConsignes] = useState<string[]>([]);

  useEffect(() => {
    if (etat.run !== "en_cours") return;
    const id = window.setInterval(() => setFranchies((n) => Math.min(n + 1, etapes.length)), 1800);
    return () => window.clearInterval(id);
  }, [etat.run, etapes.length]);

  useEffect(() => {
    if (etat.run === "en_cours" && franchies >= etapes.length) maj({ run: "proposition" });
  }, [etat.run, franchies, etapes.length, maj]);

  const enCours = etat.run === "en_cours";
  const message =
    etat.run === "aucun"
      ? "Aucune mission lancée"
      : enCours
        ? "Je compare les sous-tapis pour le couloir"
        : etat.run === "termine"
          ? "Mission terminée. Rien n'a été acheté."
          : "Proposition prête. Rien n'est acheté.";

  return (
    <Ecran>
      <EnTete
        titre="Agent Chez Soi"
        retour={`${base}/actions`}
        droite={
          <BoutonRond href={`${base}/actions`} label="Plan d'action">
            <Menu className="size-5" />
          </BoutonRond>
        }
      />
      <Corps>
        {!logement.exemple && etat.run === "aucun" ? (
          <div className="rounded-[28px] bg-lavande p-6 text-center">
            <p className="text-lg font-bold">Aucune mission en cours</p>
            <p className="mt-1 text-encre-douce">Choisissez dans le plan d&apos;action ce que l&apos;agent prépare pour vous.</p>
          </div>
        ) : (
        <RunStatus
          message={message}
          etapes={etapes}
          franchies={franchies}
          enCours={enCours}
          onArret={() => maj({ run: "aucun" })}
        />
        )}
        <div className="flex justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <MousePointer2 className="size-3.5 fill-current" />
            {logement.exemple ? "Replay du run du 18/11 · IKEA" : "Session en direct"}
          </span>
          <span className="text-encre-douce">Propulsé par H Company</span>
        </div>
        <SteerInput
          actif={enCours}
          onEnvoi={(c) => {
            setConsignes((l) => [...l, c]);
          }}
        />
        {consignes.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-encre-douce">
            {consignes.map((c, i) => (
              <li key={i}>
                Consigne « {c} » {logement.exemple ? "notée (dans le replay, elle n'est pas envoyée)" : "envoyée à l'agent"}.
              </li>
            ))}
          </ul>
        )}
      </Corps>
      <Pied>
        {etat.run === "aucun" ? (
          <Bouton href={`${base}/actions`}>Choisir les missions</Bouton>
        ) : (
          <Bouton href={`${base}/agent/validation`} variante={enCours ? "contour" : "plein"}>
            {enCours ? "Voir le résultat dès qu'il est prêt" : "Voir le résultat"}
          </Bouton>
        )}
      </Pied>
      <BarreOnglets />
    </Ecran>
  );
}
