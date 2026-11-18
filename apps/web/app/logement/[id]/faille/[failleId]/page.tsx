"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Columns2, Menu, Minus, MousePointer2, Plus, RotateCw } from "lucide-react";

import { ARButton } from "@/components/ARButton";
import { SourceBadge } from "@/components/SourceBadge";
import { BarreOnglets } from "@/components/chez-soi/BarreOnglets";
import { Bouton, BoutonRond, Corps, Ecran, EnTete, PastilleNiveau, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import { cn } from "@/lib/utils";

const Viewer3D = dynamic(() => import("@/components/Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-lavande" />,
});

function Pas({ label, valeur, onChange }: { label: string; valeur: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-encre-douce">{label}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Diminuer ${label}`}
          onClick={() => onChange(Math.max(1, valeur - 1))}
          className="grid size-10 place-items-center rounded-full border border-gris-ligne bg-white"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-20 text-center text-lg font-bold">{valeur} cm</span>
        <button
          type="button"
          aria-label={`Augmenter ${label}`}
          onClick={() => onChange(valeur + 1)}
          className="grid size-10 place-items-center rounded-full border border-gris-ligne bg-white"
        >
          <Plus className="size-4" />
        </button>
      </span>
    </div>
  );
}

/**
 * Écran 7 · Faille. Vue 3D de la pièce, description, cote éditable puis confirmée par l'utilisateur.
 * La cote confirmée (`cote_confirmee_cm`) est l'entrée de l'usage 2 : l'agent la lit avec `get_mesures`.
 */
export default function PageFaille() {
  const router = useRouter();
  const { failleId } = useParams<{ failleId: string }>();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const f = logement.failles.find((x) => x.id === failleId);
  const [tourner, setTourner] = useState(false);
  const [apres, setApres] = useState(false);

  if (!f) return null;
  const piece = logement.pieces.find((p) => p.id === f.piece_id);
  const cote = etat.cotes[f.id];

  const setCote = (p: Partial<NonNullable<typeof cote>>) =>
    maj({ cotes: { ...etat.cotes, [f.id]: { ...cote!, ...p, confirmee: false } } });

  return (
    <Ecran>
      <EnTete
        titre={piece?.nom ?? "Faille"}
        retour={`${base}/plan`}
        droite={
          <BoutonRond href={`${base}/actions`} label="Plan d'action">
            <Menu className="size-5" />
          </BoutonRond>
        }
      />
      <Corps>
        <div className="relative h-72 overflow-hidden rounded-[28px] bg-lavande">
          <Viewer3D
            className="h-full w-full"
            tourner={tourner}
            apres={apres}
            objet={
              cote && f.element === "tapis"
                ? { largeur_cm: cote.largeur_cm, longueur_cm: cote.longueur_cm, libelle: f.titre }
                : null
            }
          />
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-white px-3 py-1 text-xs font-bold">
            {apres ? "Après" : "Vous êtes ici"}
          </span>
          <PastilleNiveau niveau={f.niveau} className="pointer-events-none absolute top-3 right-3" />
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-encre-douce">
            {f.origine === "pipeline" ? "Mesuré sur votre vidéo" : f.origine === "precalcule" ? "Modèle précalculé" : "Saisie manuelle"}
          </span>
        </div>

        <div className="relative flex items-start justify-center gap-6">
          <ARButton />
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTourner((v) => !v)}
              aria-pressed={tourner}
              aria-label="Tourner la vue"
              className="grid size-16 place-items-center rounded-full bg-encre text-white"
            >
              <RotateCw className="size-6" />
            </button>
            <span className="text-sm font-bold">Tourner</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => setApres((v) => !v)}
              aria-pressed={apres}
              aria-label="Avant, après"
              className={cn(
                "grid size-14 place-items-center rounded-full border border-gris-ligne",
                apres ? "bg-vert-clair" : "bg-white",
              )}
            >
              <Columns2 className="size-5" />
            </button>
            <span className="text-sm font-bold">Avant/après</span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold">{f.titre}</h1>
          <p className="mt-1 text-encre-douce">{f.description}</p>
          <SourceBadge source={f.source} className="mt-2" />
        </div>

        {cote && f.cote && (
          <div
            className={cn(
              "flex flex-col gap-3 rounded-3xl border-2 bg-creme p-4",
              cote.confirmee ? "border-vert" : "border-ambre",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">{f.cote.libelle}</span>
              <span
                className={cn(
                  "rounded-full border px-3 py-0.5 text-xs font-bold",
                  cote.confirmee ? "border-vert bg-vert-clair text-vert" : "border-ambre bg-ambre-clair text-[#8a5a00]",
                )}
              >
                {cote.confirmee ? "Confirmée" : "À confirmer"}
              </span>
            </div>
            <Pas label="Largeur" valeur={cote.largeur_cm} onChange={(v) => setCote({ largeur_cm: v })} />
            <Pas label="Longueur" valeur={cote.longueur_cm} onChange={(v) => setCote({ longueur_cm: v })} />
          </div>
        )}
      </Corps>
      <Pied>
        {cote && !cote.confirmee ? (
          <Bouton onClick={() => maj({ cotes: { ...etat.cotes, [f.id]: { ...cote, confirmee: true } } })}>
            <Check className="size-5" /> Je confirme {cote.largeur_cm} × {cote.longueur_cm} cm
          </Bouton>
        ) : (
          <Bouton onClick={() => router.push(`${base}/actions`)}>
            <MousePointer2 className="size-5 fill-current" /> {cote ? "Cote prête pour l'agent" : "Voir le plan d'action"}
          </Bouton>
        )}
      </Pied>
      <BarreOnglets />
    </Ecran>
  );
}
