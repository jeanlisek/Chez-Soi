import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { LIBELLE_NIVEAU, type Niveau } from "@/lib/domaine";

/**
 * Cadre mobile de la maquette : 430 px de large au plus, centré sur ordinateur,
 * plein écran sur téléphone. `ton` reprend les fonds des écrans (crème, lavande, encre).
 */
export function Ecran({
  children,
  ton = "creme",
  className,
}: {
  children: React.ReactNode;
  ton?: "creme" | "lavande" | "encre";
  className?: string;
}) {
  return (
    <div className="flex h-dvh justify-center sm:h-auto sm:min-h-dvh sm:items-center sm:py-6">
      <div
        className={cn(
          "relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden sm:h-[844px] sm:rounded-[44px] sm:shadow-[0_24px_60px_-20px_rgba(18,28,56,0.35)]",
          ton === "creme" && "bg-creme text-encre",
          ton === "lavande" && "bg-lavande text-encre",
          ton === "encre" && "bg-encre text-white",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Corps défilant de l'écran, avec la marge des bords de la maquette. */
export function Corps({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 *:shrink-0", className)}>{children}</main>;
}

/** Pied d'écran collé en bas (bouton principal), au-dessus de la barre d'onglets s'il y en a une. */
export function Pied({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("z-10 flex shrink-0 flex-col gap-2 px-5 pt-3 pb-5", className)}>{children}</div>;
}

export function BoutonRond({
  href,
  onClick,
  label,
  children,
  className,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const classes = cn(
    "grid size-12 shrink-0 place-items-center rounded-full border border-gris-ligne bg-white text-encre transition active:scale-95",
    className,
  );
  if (href)
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} aria-label={label} className={classes}>
      {children}
    </button>
  );
}

/** En-tête : retour, titre centré, action ou compteur à droite. */
export function EnTete({
  titre,
  retour,
  droite,
}: {
  titre: string;
  retour?: string;
  droite?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
      {retour ? (
        <BoutonRond href={retour} label="Retour">
          <ChevronLeft className="size-5" />
        </BoutonRond>
      ) : (
        <span className="size-12" />
      )}
      <h1 className="text-lg font-bold">{titre}</h1>
      {droite ?? <span className="size-12" />}
    </header>
  );
}

/** Compteur d'étape circulaire (« 1/3 »). */
export function Etape({ n, sur }: { n: number; sur: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-12 place-items-center" aria-label={`Étape ${n} sur ${sur}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#e4e4ea" strokeWidth="3" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#121c38"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - n / sur)}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-bold">
        {n}/{sur}
      </span>
    </div>
  );
}

const STYLE_BOUTON = {
  plein: "bg-encre text-white",
  contour: "border-2 border-encre bg-transparent text-encre",
  blanc: "bg-white text-encre",
  fantome: "bg-transparent text-encre underline-offset-4 hover:underline",
};

export function Bouton({
  href,
  onClick,
  children,
  variante = "plein",
  disabled,
  className,
  type = "button",
  externe,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variante?: keyof typeof STYLE_BOUTON;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  externe?: boolean;
}) {
  const classes = cn(
    "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    STYLE_BOUTON[variante],
    className,
  );
  if (href && !disabled) {
    if (externe)
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {children}
        </a>
      );
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

const STYLE_NIVEAU: Record<Niveau, string> = {
  critique: "border-rouge bg-rouge text-white",
  eleve: "border-rouge bg-rouge-clair text-rouge",
  modere: "border-rouge/60 bg-white text-rouge",
  surveiller: "border-encre-douce/40 bg-white text-encre-douce",
};

export function PastilleNiveau({ niveau, className }: { niveau: Niveau; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold",
        STYLE_NIVEAU[niveau],
        className,
      )}
    >
      {LIBELLE_NIVEAU[niveau]}
    </span>
  );
}

export function Puce({
  actif,
  onClick,
  children,
  className,
}: {
  actif?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "inline-flex h-11 items-center rounded-full border px-4 text-sm font-bold transition",
        actif ? "border-encre bg-encre text-white" : "border-gris-ligne bg-white text-encre",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Carte({
  children,
  ton = "blanc",
  className,
}: {
  children: React.ReactNode;
  ton?: "blanc" | "lavande" | "lilas" | "lilas-clair" | "lavande-claire" | "encre";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] p-5",
        ton === "blanc" && "bg-white",
        ton === "lavande" && "bg-lavande",
        ton === "lilas" && "bg-lilas",
        ton === "lilas-clair" && "bg-lilas-clair",
        ton === "lavande-claire" && "bg-lavande-claire",
        ton === "encre" && "bg-encre text-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Bandeau discret « logement exemple » : on ne montre jamais des données fictives comme réelles. */
export function BandeauExemple() {
  return (
    <p className="mx-5 mb-2 rounded-full bg-white/70 px-3 py-1 text-center text-xs font-medium text-encre-douce">
      Logement exemple · personnes et contrat fictifs
    </p>
  );
}
