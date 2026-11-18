"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, MousePointer2, RotateCcw, Share2 } from "lucide-react";

import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { PersonneEquilibre } from "@/components/chez-soi/illustrations";
import { BandeauExemple, BoutonRond, Corps, Ecran } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import type { Faille } from "@/lib/domaine";
import { cn } from "@/lib/utils";

/** Écran 12 · Suivi : avancement par pièce et prochaines démarches. */
export default function PageSuivi() {
  const { logement, etat, reinitialiser } = useParcours();
  const base = `/logement/${logement.id}`;

  // Une faille confiée à l'agent dont la proposition est approuvée passe « en traitement ».
  const statut = (f: Faille): Faille["statut"] => {
    const action = logement.actions.find((a) => a.faille_id === f.id);
    if (action && etat.missions[action.id] === "agent" && etat.run !== "aucun" && etat.decision !== "refuse")
      return f.statut === "regle" ? "regle" : "en_traitement";
    return f.statut === "en_traitement" ? "a_traiter" : f.statut;
  };
  const statuts = logement.failles.map(statut);
  const n = (s: Faille["statut"]) => statuts.filter((x) => x === s).length;

  const parPiece = logement.pieces.map((p) => {
    const fs = logement.failles.filter((f) => f.piece_id === p.id).map(statut);
    const etatPiece =
      fs.length === 0
        ? "rien"
        : fs.includes("a_traiter")
          ? "a_traiter"
          : fs.includes("en_traitement")
            ? "en_traitement"
            : fs.every((s) => s === "regle")
              ? "regle"
              : "a_surveiller";
    return { p, fs, etatPiece };
  });

  return (
    <Ecran>
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div className="flex-1 pl-1">
          <p className="text-lg font-bold">Suivi</p>
          <p className="text-sm text-encre-douce">Logement de {logement.occupant.libelle}</p>
        </div>
        <BoutonRond label="Partager le suivi">
          <Share2 className="size-5" />
        </BoutonRond>
      </header>
      {logement.exemple && <BandeauExemple />}
      <Corps>
        <div className="relative overflow-hidden rounded-[28px] bg-lavande p-5">
          <h1 className="text-2xl font-extrabold">
            {n("regle")} sur {statuts.length} réglé{n("regle") > 1 ? "s" : ""}
          </h1>
          <p className="text-encre-douce">{n("en_traitement")} en traitement par l&apos;agent</p>
          <PersonneEquilibre className="absolute top-2 right-4 h-28" />
          <div className="mt-10 flex gap-1.5">
            {[...statuts]
              .sort((a, b) => ["regle", "en_traitement", "a_traiter", "a_surveiller"].indexOf(a) - ["regle", "en_traitement", "a_traiter", "a_surveiller"].indexOf(b))
              .map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 flex-1 rounded-full border",
                    s === "regle" && "border-vert bg-vert",
                    s === "en_traitement" && "border-ambre bg-ambre",
                    s === "a_traiter" && "border-rouge bg-rouge-clair",
                    s === "a_surveiller" && "border-encre-douce/40 bg-white",
                  )}
                />
              ))}
          </div>
          <p className="mt-2 text-xs font-bold">Réglé · En traitement · À traiter · À surveiller</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {parPiece.map(({ p, fs, etatPiece }) => (
            <div
              key={p.id}
              className={cn(
                "rounded-2xl p-3",
                etatPiece === "rien" && "bg-vert-clair",
                etatPiece === "regle" && "bg-vert-clair",
                etatPiece === "en_traitement" && "bg-ambre-clair",
                etatPiece === "a_traiter" && "bg-rouge-clair",
                etatPiece === "a_surveiller" && "bg-gris-ligne/60",
              )}
            >
              <p className="font-bold">{p.nom}</p>
              <p
                className={cn(
                  "text-sm",
                  etatPiece === "rien" || etatPiece === "regle" ? "text-vert" : etatPiece === "en_traitement" ? "text-[#8a5a00]" : etatPiece === "a_traiter" ? "text-rouge" : "text-encre-douce",
                )}
              >
                {etatPiece === "rien"
                  ? "rien à faire"
                  : etatPiece === "regle"
                    ? "réglé"
                    : etatPiece === "en_traitement"
                      ? `${fs.filter((s) => s === "en_traitement").length} en traitement`
                      : etatPiece === "a_traiter"
                        ? `${fs.filter((s) => s === "a_traiter").length} à traiter`
                        : "à surveiller"}
              </p>
            </div>
          ))}
        </div>

        <h2 className="text-lg font-bold">À venir</h2>
        <Link href={`${base}/absence`} className="flex items-center gap-3 rounded-full bg-encre p-2 pr-2 text-white">
          <span className="grid size-11 place-items-center rounded-full bg-white text-encre">
            <CalendarDays className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-bold">Absence de {logement.occupant.libelle}</span>
            <span className="text-sm text-white/70">
              {etat.parcours === "A" ? "Assureur et OTV à relire" : "OTV à relire"}
            </span>
          </span>
          <span className="grid size-10 place-items-center rounded-full bg-ambre text-encre">
            <ChevronRight className="size-5" />
          </span>
        </Link>
        <div className="flex items-center gap-3 rounded-full bg-white p-2">
          <span className="grid size-11 place-items-center rounded-full bg-lavande-claire">
            <MousePointer2 className="size-5 fill-current text-[#1c2f7a]" />
          </span>
          <span className="flex-1">
            <span className="block font-bold">Veille des prix</span>
            <span className="text-sm text-encre-douce">À trancher par l&apos;équipe</span>
          </span>
        </div>
        {logement.exemple && (
          <button
            type="button"
            onClick={reinitialiser}
            className="mx-auto flex items-center gap-2 py-3 font-semibold text-encre-douce"
          >
            <RotateCcw className="size-4" /> Recommencer la démo
          </button>
        )}
      </Corps>
      <BarreOnglets />
    </Ecran>
  );
}
