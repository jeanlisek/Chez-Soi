"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, Bell, Check, ChevronRight } from "lucide-react";

import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { LogoMaison, RepereSourire } from "@/components/chez-soi/illustrations";
import { BandeauExemple, BoutonRond, Corps, Ecran, PastilleNiveau, Puce } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import type { Faille, Niveau, Risque } from "@/lib/domaine";
import { cn } from "@/lib/utils";

const ORDRE: Niveau[] = ["critique", "eleve", "modere", "surveiller"];

/** Disposition schématique du T2, comme sur la maquette (3 colonnes). */
const DISPOSITION: { id: string; col: string }[] = [
  { id: "chambre", col: "col-span-1" },
  { id: "salon", col: "col-span-1" },
  { id: "cuisine", col: "col-span-1" },
  { id: "couloir", col: "col-span-3" },
  { id: "salle-de-bain", col: "col-span-1" },
  { id: "", col: "col-span-1" },
  { id: "entree", col: "col-span-1" },
];

function Compteur({ failles }: { failles: Faille[] }) {
  if (failles.length === 0)
    return (
      <span className="grid size-6 place-items-center rounded-full bg-vert text-white">
        <Check className="size-3.5" />
      </span>
    );
  const pire = ORDRE.find((n) => failles.some((f) => f.niveau === n))!;
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-full border text-xs font-bold",
        pire === "critique" && "border-rouge bg-rouge text-white",
        (pire === "eleve" || pire === "modere") && "border-rouge text-rouge",
        pire === "surveiller" && "border-dashed border-encre-douce text-encre-douce",
      )}
    >
      {failles.length}
    </span>
  );
}

/** Écran 6 · Accueil et plan du logement : points à traiter, filtres chute / intrusion, failles par pièce. */
export default function PagePlan() {
  const { logement } = useParcours();
  const base = `/logement/${logement.id}`;
  const [filtre, setFiltre] = useState<Risque | "toutes">("toutes");
  const [piece, setPiece] = useState(
    logement.exemple ? "couloir" : (logement.failles[0]?.piece_id ?? logement.pieces[0]?.id ?? ""),
  );
  const disposition = logement.exemple
    ? DISPOSITION
    : logement.pieces.map((p, i, t) => ({ id: p.id, col: t.length % 3 === 1 && i === t.length - 1 ? "col-span-3" : "col-span-1" }));

  const failles = useMemo(
    () => logement.failles.filter((f) => filtre === "toutes" || f.risque === filtre),
    [logement.failles, filtre],
  );
  const total = logement.failles.length;
  const regles = logement.failles.filter((f) => f.statut === "regle").length;
  const compte = (n: Niveau) => logement.failles.filter((f) => f.niveau === n).length;
  const resume = [
    compte("critique") && `${compte("critique")} critique`,
    compte("eleve") && `${compte("eleve")} élevés`,
    compte("modere") && `${compte("modere")} modérés`,
  ]
    .filter(Boolean)
    .join(" · ");
  const nomPiece = logement.pieces.find((p) => p.id === piece)?.nom ?? "";
  const listePiece = failles.filter((f) => f.piece_id === piece);

  return (
    <Ecran>
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <LogoMaison className="size-12" />
        <div className="flex-1">
          <p className="text-lg leading-tight font-bold">Bonjour {logement.aidant}</p>
          <p className="text-sm text-encre-douce">
            Logement de {logement.occupant.libelle} · {logement.type}
          </p>
        </div>
        <BoutonRond label="Notifications">
          <Bell className="size-5" />
        </BoutonRond>
      </header>
      {logement.exemple && <BandeauExemple />}
      <Corps>
        <div className="relative overflow-hidden rounded-[28px] bg-lavande p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-extrabold">
                {total} point{total > 1 ? "s" : ""} à traiter
              </h1>
              <p className="text-sm text-encre-douce">{resume || "Analyse en attente"}</p>
            </div>
            <span className="grid size-12 place-items-center rounded-full border-2 border-white text-sm font-bold">
              {regles}/{total}
            </span>
          </div>
          <div className="mt-6 flex items-end justify-between">
            <Link
              href={`${base}/actions`}
              className="rounded-full bg-encre px-5 py-3 text-sm font-bold tracking-wide text-white uppercase"
            >
              Voir le plan
            </Link>
            <RepereSourire className="-mb-6 h-20" />
          </div>
        </div>

        <div className="flex gap-2">
          <Puce actif={filtre === "toutes"} onClick={() => setFiltre("toutes")}>
            Toutes
          </Puce>
          <Puce actif={filtre === "chute"} onClick={() => setFiltre("chute")}>
            Chute · {logement.failles.filter((f) => f.risque === "chute").length}
          </Puce>
          <Puce actif={filtre === "intrusion"} onClick={() => setFiltre("intrusion")}>
            Intrusion · {logement.failles.filter((f) => f.risque === "intrusion").length}
          </Puce>
        </div>

        {logement.pieces.length === 0 && (
          <div className="rounded-[28px] bg-white p-5 text-center">
            <p className="font-bold">Aucune pièce filmée pour l&apos;instant</p>
            <p className="mt-1 text-sm text-encre-douce">Filmez une pièce pour obtenir son plan et ses points à traiter.</p>
            <Link href={`${base}/capture`} className="mt-3 inline-block rounded-full bg-encre px-5 py-3 text-sm font-bold text-white">
              Filmer une pièce
            </Link>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 rounded-[28px] bg-white/50 p-3" aria-label="Plan du logement">
          {disposition.map(({ id, col }, i) => {
            if (!id) return <span key={i} className="rounded-2xl bg-gris-ligne/50" />;
            const p = logement.pieces.find((x) => x.id === id);
            if (!p) return null;
            const fp = failles.filter((f) => f.piece_id === id);
            const actif = piece === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPiece(id)}
                className={cn(
                  "flex justify-between rounded-2xl p-3 text-left text-sm font-bold transition",
                  col,
                  id === "couloir" ? "items-center" : "min-h-24 flex-col",
                  actif ? "border-2 border-encre bg-lavande" : "bg-white",
                )}
              >
                {p.nom}
                <Compteur failles={fp} />
              </button>
            );
          })}
        </div>

        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{nomPiece}</h2>
          <span className="text-sm font-semibold text-[#1c2f7a]">
            {listePiece.length} point{listePiece.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {listePiece.length === 0 && (
            <li className="rounded-3xl bg-vert-clair p-4 text-sm font-semibold text-vert">Rien à faire dans cette pièce.</li>
          )}
          {listePiece.map((f) => (
            <li key={f.id}>
              <Link href={`${base}/faille/${f.id}`} className="flex items-center gap-3 rounded-3xl bg-white p-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-rouge-clair text-rouge">
                  <AlertCircle className={cn("size-5", f.niveau === "critique" && "fill-rouge text-white")} />
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{f.titre}</span>
                  <span className="text-sm text-encre-douce">
                    {f.risque === "chute" ? "Chute" : "Intrusion"} ·{" "}
                    {f.cote
                      ? `${f.cote.largeur_cm} × ${f.cote.longueur_cm} cm ${f.cote.statut === "a_confirmer" ? "à confirmer" : "confirmé"}`
                      : f.source.force === "contrat"
                        ? `Contrat p. ${f.source.page}`
                        : "Recommandé"}
                  </span>
                </span>
                <PastilleNiveau niveau={f.niveau} />
                <ChevronRight className="size-4 text-encre-douce" />
              </Link>
            </li>
          ))}
        </ul>
      </Corps>
      <BarreOnglets />
    </Ecran>
  );
}
