"use client";

import { Eye, Pause, Square } from "lucide-react";

import { NavigateurSourire } from "@/components/chez-soi/illustrations";
import { cn } from "@/lib/utils";

/**
 * Suivi d'une session de l'agent H : message courant, contrôles, étapes franchies.
 * Les étapes viennent de `/changes` (pages vues, actions choisies) écrites dans `runs_agent`.
 */
export function RunStatus({
  message,
  etapes,
  franchies,
  enCours,
  replayUrl,
  onArret,
}: {
  message: string;
  etapes: string[];
  franchies: number;
  enCours: boolean;
  replayUrl?: string;
  onArret?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[28px] bg-lavande p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Usage 2 · objets</span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold",
              enCours ? "border-[#1a3a86]/40 bg-white/70 text-[#1a3a86]" : "border-vert bg-vert-clair text-vert",
            )}
          >
            {enCours ? "En cours" : "Terminé"}
          </span>
        </div>
        <NavigateurSourire className={cn("mx-auto my-3 w-28", enCours && "animate-bounce [animation-duration:2s]")} />
        <p className="mx-auto w-fit rounded-full bg-white px-4 py-2 text-center text-sm font-bold">{message}</p>
        <div className="mt-4 flex justify-center gap-4">
          <button type="button" aria-label="Pause" disabled className="grid size-14 place-items-center rounded-full bg-white disabled:opacity-60">
            <Pause className="size-5" />
          </button>
          <a
            href={replayUrl ?? "#"}
            target={replayUrl ? "_blank" : undefined}
            rel="noopener noreferrer"
            aria-label="Regarder l'agent"
            className="grid size-16 place-items-center rounded-full bg-encre text-white ring-4 ring-white/40"
          >
            <Eye className="size-6" />
          </a>
          <button
            type="button"
            aria-label="Arrêter l'agent"
            onClick={onArret}
            disabled={!enCours}
            className="grid size-14 place-items-center rounded-full bg-white disabled:opacity-60"
          >
            <Square className="size-5" />
          </button>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {etapes.map((e, i) => (
          <li key={e} className={cn("flex items-center gap-3", i < franchies ? "text-encre" : "text-encre-douce/70")}>
            <span
              className={cn(
                "size-4 shrink-0 rounded-full border-2",
                i < franchies ? "border-vert bg-vert" : i === franchies && enCours ? "animate-pulse border-[#1a3a86]" : "border-ambre/70",
              )}
            />
            <span className={cn(i === franchies && enCours && "font-bold text-[#1a3a86]")}>{e}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
