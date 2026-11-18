"use client";

import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

import { ValidationModal } from "@/components/ValidationModal";
import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { NavigateurSourire } from "@/components/chez-soi/illustrations";
import { Bouton, BoutonRond, Corps, Ecran, EnTete } from "@/components/chez-soi/ui";
import { PROPOSITION_EXEMPLE } from "@/lib/demo/logement-exemple";
import { useParcours } from "@/lib/demo/etat";

/** Écran 10 · Validation : l'agent attend la décision de Marc avant tout panier ou envoi. */
export default function PageValidation() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;

  return (
    <Ecran>
      <EnTete
        titre="Validation"
        retour={`${base}/agent`}
        droite={
          <BoutonRond href={`${base}/agent`} label="Suivre l'agent">
            <Eye className="size-5" />
          </BoutonRond>
        }
      />
      <Corps>
        {etat.run === "en_cours" || etat.run === "aucun" ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-lavande p-6 text-center">
            <NavigateurSourire className="w-28" />
            <h1 className="text-lg font-bold">
              {etat.run === "aucun" ? "Aucune proposition pour l'instant" : "L'agent travaille encore"}
            </h1>
            <p className="text-encre-douce">
              {etat.run === "aucun"
                ? "Lancez une mission depuis le plan d'action."
                : "Vous recevez une notification quand sa proposition sera prête."}
            </p>
            <Bouton href={etat.run === "aucun" ? `${base}/actions` : `${base}/agent`} variante="blanc">
              {etat.run === "aucun" ? "Voir le plan d'action" : "Suivre l'agent"}
            </Bouton>
          </div>
        ) : etat.decision ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-vert-clair p-6 text-center">
            <h1 className="text-lg font-bold">
              {etat.decision === "approuve"
                ? "Approuvé. À vous d'ajouter le produit."
                : etat.decision === "refuse"
                  ? "Refusé. L'agent s'est arrêté."
                  : "Modification demandée à l'agent."}
            </h1>
            <p className="text-encre-douce">Rien n&apos;a été acheté ni payé par l&apos;agent.</p>
            {etat.decision === "approuve" && (
              <Bouton href={PROPOSITION_EXEMPLE.url} externe>
                Ouvrir la fiche produit
              </Bouton>
            )}
            <Bouton href={`${base}/suivi`} variante="blanc">
              Voir le suivi
            </Bouton>
          </div>
        ) : (
          <ValidationModal
            proposition={PROPOSITION_EXEMPLE}
            onDecision={(d) => {
              maj({ decision: d, run: d === "modifier" ? "en_cours" : "termine" });
              if (d === "modifier") router.push(`${base}/agent`);
            }}
          />
        )}
      </Corps>
      <BarreOnglets />
    </Ecran>
  );
}
