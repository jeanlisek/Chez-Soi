"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { PlanAction } from "@/components/PlanAction";
import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { BandeauExemple, Bouton, BoutonRond, Corps, Ecran, EnTete, Pied, Puce } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";

type Onglet = "priorite" | "contrat" | "plus_tard";

/**
 * Écran 8 · Plan d'action. Ordre du verdict : contrat (clause et page), puis loi, puis recommandé.
 * Le verdict vient des règles ; le texte explicatif du LLM ne le change jamais.
 */
export default function PageActions() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [onglet, setOnglet] = useState<Onglet>("priorite");

  const actions = [...logement.actions].sort((a, b) => a.priorite - b.priorite);
  const visibles = actions.filter((a) =>
    onglet === "contrat" ? a.source.force === "contrat" : onglet === "priorite" ? a.groupe === "priorite" : a.groupe === "plus_tard",
  );
  const missions = actions.filter((a) => etat.missions[a.id] === "agent" && a.groupe === "priorite");
  const compte = (o: Onglet) =>
    o === "contrat" ? actions.filter((a) => a.source.force === "contrat").length : actions.filter((a) => a.groupe === o).length;

  return (
    <Ecran>
      <EnTete
        titre="Plan d'action"
        retour={`${base}/plan`}
        droite={
          <BoutonRond label="Filtres">
            <SlidersHorizontal className="size-5" />
          </BoutonRond>
        }
      />
      {logement.exemple && <BandeauExemple />}
      <Corps>
        <div className="flex gap-2">
          <Puce actif={onglet === "priorite"} onClick={() => setOnglet("priorite")}>
            Priorités · {compte("priorite")}
          </Puce>
          <Puce actif={onglet === "contrat"} onClick={() => setOnglet("contrat")}>
            Contrat{etat.parcours === "A" ? ` · ${compte("contrat")}` : ""}
          </Puce>
          <Puce actif={onglet === "plus_tard"} onClick={() => setOnglet("plus_tard")}>
            Plus tard · {compte("plus_tard")}
          </Puce>
        </div>
        {onglet === "contrat" && etat.parcours === "B" ? (
          <p className="rounded-3xl bg-white p-4 text-encre-douce">
            Parcours sans contrat : le plan s&apos;appuie sur la loi puis sur les recommandations.
          </p>
        ) : (
          visibles.map((a, i) => (
            <PlanAction
              key={a.id}
              action={a}
              rang={onglet === "priorite" ? i + 1 : a.priorite}
              choix={etat.missions[a.id] ?? "moi"}
              onChoix={(c) => maj({ missions: { ...etat.missions, [a.id]: c } })}
            />
          ))
        )}
      </Corps>
      <Pied>
        <Bouton
          disabled={missions.length === 0}
          onClick={() => {
            maj({ run: "en_cours", decision: null });
            router.push(`${base}/agent`);
          }}
        >
          Lancer l&apos;agent · {missions.length} mission{missions.length > 1 ? "s" : ""}
        </Bouton>
      </Pied>
      <BarreOnglets />
    </Ecran>
  );
}
