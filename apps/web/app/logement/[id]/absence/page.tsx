"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

import { ModeAbsence } from "@/components/ModeAbsence";
import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { BandeauExemple, Bouton, BoutonRond, Corps, Ecran, EnTete, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";

/** Écran 11 · Mode absence (usage 3 : préparer sans jamais envoyer). */
export default function PageAbsence() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [pret, setPret] = useState(false);
  const absence = logement.absence ?? { depart_le: "2026-12-15", retour_le: "2027-01-19", motif: "" };

  return (
    <Ecran>
      <EnTete
        titre="Mode absence"
        retour={`${base}/plan`}
        droite={
          <BoutonRond label="Notifications">
            <Bell className="size-5" />
          </BoutonRond>
        }
      />
      {logement.exemple && <BandeauExemple />}
      <Corps>
        <ModeAbsence
          occupant={logement.occupant.libelle}
          motif={absence.motif}
          depart={absence.depart_le}
          jours={etat.absenceJours}
          onJours={(n) => maj({ absenceJours: n })}
          contrat={etat.parcours === "A" ? logement.contrat : null}
          zone={logement.zone_otv}
        />
        {pret && (
          <p className="rounded-2xl bg-vert-clair p-3 text-sm font-medium text-vert">
            Récapitulatif prêt. Ouvrez service-public.gouv.fr, connectez-vous avec FranceConnect, relisez et envoyez
            vous-même. Rien n&apos;a été envoyé.
          </p>
        )}
      </Corps>
      <Pied>
        {pret ? (
          <Bouton href="https://www.service-public.gouv.fr/particuliers/vosdroits/F34634" externe>
            Ouvrir la démarche OTV
          </Bouton>
        ) : (
          <Bouton onClick={() => setPret(true)}>Relire et envoyer moi-même</Bouton>
        )}
      </Pied>
      <BarreOnglets />
    </Ecran>
  );
}
