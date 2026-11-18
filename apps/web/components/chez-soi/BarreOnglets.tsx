"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, List, MousePointer2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useParcours } from "@/lib/demo/etat";

/** Barre d'onglets des écrans 6 à 12 : Accueil, Plan, Agent, Absence, Suivi. */
export function BarreOnglets() {
  const pathname = usePathname();
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;
  const onglets = [
    { href: `${base}/plan`, label: "Accueil", Icone: Home, actif: ["/plan", "/faille"] },
    { href: `${base}/actions`, label: "Plan", Icone: List, actif: ["/actions"] },
    { href: `${base}/agent`, label: "Agent", Icone: MousePointer2, actif: ["/agent"] },
    { href: `${base}/absence`, label: "Absence", Icone: CalendarDays, actif: ["/absence"] },
    { href: `${base}/suivi`, label: "Suivi", Icone: BarChart3, actif: ["/suivi"] },
  ];
  const attente = etat.run === "proposition" || etat.run === "en_cours";

  return (
    <nav
      aria-label="Navigation principale"
      className="z-20 grid shrink-0 grid-cols-5 border-t border-gris-ligne bg-white/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur sm:rounded-b-[44px]"
    >
      {onglets.map(({ href, label, Icone, actif }) => {
        const estActif = actif.some((s) => pathname.startsWith(base + s));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-col items-center gap-0.5 py-1 text-xs font-semibold",
              estActif ? "text-[#1a3a86]" : "text-encre-douce",
            )}
            aria-current={estActif ? "page" : undefined}
          >
            <span className="relative">
              <Icone className={cn("size-6", estActif && label === "Agent" && "fill-current")} strokeWidth={1.8} />
              {label === "Agent" && attente && (
                <span className="absolute -top-1.5 -right-2.5 grid size-4 place-items-center rounded-full bg-ambre text-[10px] font-bold text-encre">
                  1
                </span>
              )}
            </span>
            {label}
            {estActif && <span className="absolute -bottom-1 size-1 rounded-full bg-[#1a3a86]" />}
          </Link>
        );
      })}
    </nav>
  );
}
