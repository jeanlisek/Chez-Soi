"use client";

import { MousePointer2 } from "lucide-react";

import { PastilleNiveau } from "@/components/chez-soi/ui";
import type { Action } from "@/lib/domaine";
import { cn } from "@/lib/utils";

const FOND = ["bg-lilas", "bg-lavande", "bg-white"];
const FOND_BASCULE = ["bg-lilas-clair", "bg-lavande-claire", "bg-creme"];

/**
 * Une action du plan : rang, source (contrat avec page, loi, recommandé), et le choix
 * « L'agent prépare » ou « Je m'en occupe ». L'agent s'arrête toujours avant le panier.
 */
export function PlanAction({
  action,
  rang,
  choix,
  onChoix,
}: {
  action: Action;
  rang: number;
  choix: "agent" | "moi";
  onChoix: (c: "agent" | "moi") => void;
}) {
  const i = Math.min(rang - 1, 2);
  return (
    <article className={cn("rounded-[28px] p-4", FOND[i])}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full font-bold", i < 2 ? "bg-white" : "")}>
          {rang}
        </span>
        <div className="flex-1">
          <h3 className="text-lg leading-tight font-bold">{action.titre}</h3>
          <p className="text-sm text-encre-douce">{action.detail}</p>
        </div>
        <PastilleNiveau niveau={action.niveau} />
      </div>
      <div className={cn("mt-3 grid grid-cols-2 rounded-full p-1", FOND_BASCULE[i])} role="radiogroup">
        {(["agent", "moi"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choix === c}
            onClick={() => onChoix(c)}
            className={cn(
              "h-10 rounded-full text-sm font-bold transition",
              choix === c ? "bg-encre text-white" : "text-encre",
            )}
          >
            {c === "agent" ? "L'agent prépare" : "Je m'en occupe"}
          </button>
        ))}
      </div>
      {choix === "agent" && (
        <p className="mt-3 flex gap-2 text-sm">
          <MousePointer2 className="mt-0.5 size-3.5 shrink-0 fill-current" />
          <span>
            {action.mission} <strong>Arrêt avant le panier : vous validez.</strong>
          </span>
        </p>
      )}
    </article>
  );
}
