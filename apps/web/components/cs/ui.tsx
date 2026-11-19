"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Cursor, Octagon, Triangle, CircleCheck, CircleInfo, type IconName } from "./icons";
import { LIBELLE_NIVEAU, type Niveau } from "@/lib/domaine";
import { useParcours } from "@/lib/demo/etat";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Écran (cadre mobile) ---------- */

export function Screen({ children, bg = "creme", nav, className }: { children: ReactNode; bg?: "creme" | "pervenche" | "nuit"; nav?: NavKey; className?: string }) {
  const bgClass = { creme: "bg-creme text-ink", pervenche: "bg-pervenche text-ink", nuit: "bg-nuit text-white" }[bg];
  return (
    <div className="min-h-dvh w-full bg-[#E9ECF5] md:py-8">
      <div className={cx("relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col md:min-h-[860px] md:overflow-hidden md:rounded-[44px] md:shadow-[0_30px_80px_-30px_rgba(18,27,54,0.45)]", bgClass)}>
        <main className={cx("flex flex-1 flex-col gap-4 px-5 pb-6 pt-5", nav && "pb-28", className)}>{children}</main>
        {nav && <BottomNav active={nav} />}
      </div>
    </div>
  );
}

/* ---------- En-tête ---------- */

export function Header({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="w-12">{left}</div>
      {title && <h1 className="text-lg font-bold">{title}</h1>}
      <div className="flex w-12 justify-end">{right}</div>
    </header>
  );
}

/* ---------- Boutons ronds ---------- */

type RoundVariant = "blanc" | "nuit" | "pervenche" | "sombre" | "verre";
const ROUND: Record<RoundVariant, string> = {
  blanc: "bg-white border border-line text-nuit",
  nuit: "bg-nuit border border-nuit text-white",
  pervenche: "bg-pervenche border border-pervenche text-nuit",
  sombre: "bg-nuit-3 border border-nuit-3 text-white",
  verre: "bg-white/60 border border-white/60 text-nuit",
};

export function RoundButton({ icon, label, href, onClick, size = 48, variant = "blanc", children, className }: { icon?: IconName; label: string; href?: string; onClick?: () => void; size?: number; variant?: RoundVariant; children?: ReactNode; className?: string }) {
  const style = { width: size, height: size };
  const cls = cx("inline-flex flex-none items-center justify-center rounded-full transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info-solid", ROUND[variant], className);
  const content = children ?? (icon && <Icon name={icon} size={Math.round(size * 0.42)} />);
  if (href) return <Link href={href} aria-label={label} className={cls} style={style}>{content}</Link>;
  return <button type="button" aria-label={label} onClick={onClick} className={cls} style={style}>{content}</button>;
}

export function BackButton({ href }: { href: string }) {
  return <RoundButton icon="back" label="Retour" href={href} />;
}

/* ---------- Pilules (boutons principaux) ---------- */

type PillVariant = "nuit" | "blanc" | "contour" | "ambre";
const PILL: Record<PillVariant, string> = {
  nuit: "bg-nuit text-white hover:bg-[#0B1226]",
  blanc: "bg-white text-nuit",
  contour: "bg-transparent text-nuit border-[1.5px] border-nuit",
  ambre: "bg-attention-solid text-attention-on",
};

export function Pill({ children, href, onClick, variant = "nuit", disabled, className, type = "button" }: { children: ReactNode; href?: string; onClick?: () => void; variant?: PillVariant; disabled?: boolean; className?: string; type?: "button" | "submit" }) {
  const cls = cx("inline-flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full px-6 text-base font-bold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info-solid", disabled ? "cursor-not-allowed bg-line text-ink-muted" : PILL[variant], className);
  if (href && !disabled) return <Link href={href} onClick={onClick} className={cls}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

/* ---------- Puces ---------- */

export function Chip({ children, active, onClick, dark, check }: { children: ReactNode; active?: boolean; onClick?: () => void; dark?: boolean; /** sélection multiple : une coche apparaît sur la puce active */ check?: boolean }) {
  const cls = dark
    ? cx("h-10 flex-none rounded-full border-[1.5px] px-4 text-sm font-bold transition-colors duration-200 active:scale-95", active ? "border-white bg-white text-nuit" : "border-nuit-4 bg-transparent text-white")
    : cx("h-10 flex-none rounded-full border px-4 text-sm font-bold transition-colors duration-200 active:scale-95", active ? "border-nuit bg-nuit text-white" : "border-line bg-white text-nuit");
  if (!onClick) return <span className={cx(cls, "inline-flex items-center")}>{children}</span>;
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick} className={cx(cls, check && "inline-flex items-center gap-1.5")}>
      {check && active && <Icon name="check" size={15} strokeWidth={2.6} className="anim-pop" />}
      {children}
    </button>
  );
}

/* ---------- Champs ---------- */

export function Field({ label, value, onChange, placeholder, id, autoComplete, inputMode, invalid }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; id: string; autoComplete?: string; inputMode?: "text" | "numeric"; invalid?: boolean }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-bold text-ink-muted">{label}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} aria-invalid={invalid || undefined}
        className={cx("h-12 w-full min-w-0 rounded-full border-[1.5px] bg-creme px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:border-nuit", invalid ? "anim-shake border-attention-icon" : "border-line")} />
    </label>
  );
}

const CHAMP = "w-full min-w-0 rounded-[22px] border-[1.5px] border-line bg-creme px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:border-nuit";

export function Select({ label, value, onChange, options, id }: { label: string; value: string; onChange: (v: string) => void; options: string[]; id: string }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-bold text-ink-muted">{label}</span>
      <span className="relative">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!value || undefined} className={cx(CHAMP, "h-12 appearance-none rounded-full pr-10", !value && "font-medium text-ink-muted")}>
          {!value && <option value="" disabled>Choisir…</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Icon name="down" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted" />
      </span>
    </label>
  );
}

export function DateField({ label, value, onChange, id, aside }: { label: string; value: string; onChange: (v: string) => void; id: string; aside?: ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-center justify-between text-xs font-bold text-ink-muted">{label}{aside}</span>
      <span className="relative">
        <input id={id} type="date" value={value} max={new Date().toISOString().slice(0, 10)} min="1900-01-01" onChange={(e) => onChange(e.target.value)} aria-invalid={!value || undefined}
          className={cx(CHAMP, "date-cobalt h-12 rounded-full pr-12", !value && "font-medium text-ink-muted")} />
        <Icon name="cal" size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cobalt" />
      </span>
    </label>
  );
}

export function TextArea({ label, value, onChange, placeholder, id }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; id: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-bold text-ink-muted">{label}</span>
      <textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(CHAMP, "resize-none py-3 font-medium leading-5")} />
    </label>
  );
}

/* ---------- Menu d'options (bouton ⋯ des en-têtes) ---------- */

export function OptionsMenu({ items, label = "Options" }: { items: { label: string; icon: IconName; onClick: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <RoundButton icon={open ? "close" : "menu"} label={label} onClick={() => setOpen(!open)} variant={open ? "nuit" : "blanc"} />
      {open && (
        <div role="menu" className="anim-in absolute right-0 top-[56px] z-30 flex w-[250px] flex-col overflow-hidden rounded-xl2 border border-line bg-white py-1.5 shadow-[0_18px_40px_-18px_rgba(18,27,54,0.45)]">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.onClick(); }}
              className={cx("flex items-center gap-3 px-4 py-3 text-left text-sm font-bold active:bg-creme", it.danger ? "text-danger-text" : "text-nuit")}>
              <Icon name={it.icon} size={18} className={it.danger ? "text-danger-text" : "text-cobalt"} />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Feuille qui monte du bas de l'écran (infos complémentaires). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-nuit/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-in flex w-full max-w-[430px] flex-col gap-3 rounded-t-[32px] bg-creme px-5 pb-8 pt-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><RoundButton icon="close" label="Fermer" size={40} onClick={onClose} /></div>
        {children}
      </div>
    </div>
  );
}

/** Compteur − valeur + (âge, nombre…). La valeur rebondit à chaque changement. */
export function Stepper({ value, onChange, min = 0, max = 120, unit, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <RoundButton icon="minus" label={`${label} : moins`} size={44} onClick={() => onChange(Math.max(min, value - 1))} />
      <span key={value} className="anim-bump min-w-[74px] text-center text-[22px] font-extrabold" aria-live="polite">{value}{unit && <span className="ml-1 text-sm font-bold text-ink-muted">{unit}</span>}</span>
      <RoundButton icon="plus" label={`${label} : plus`} size={44} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  );
}

/* ---------- Toast (retour discret qui apparaît puis disparaît) ---------- */

export function useToast(sombre?: boolean) {
  const [msg, setMsg] = useState<{ text: string; n: number }>();
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string) => {
    setMsg((m) => ({ text, n: (m?.n ?? 0) + 1 }));
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(undefined), 2400);
  }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  const node = msg ? (
    <div key={msg.n} role="status" className={cx("anim-toast fixed top-[78px] left-1/2 z-30 flex max-w-[360px] -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-3 text-sm font-bold shadow-[0_12px_30px_-12px_rgba(18,27,54,0.6)]", sombre ? "bg-white text-nuit" : "bg-nuit text-white")}>
      <CircleCheck size={20} />{msg.text}
    </div>
  ) : null;
  return { show, node };
}

/* ---------- Jauge circulaire « 1/7 » ---------- */

export function Ring({ value, total, size = 54, track = "#FFFFFF", color = "#121B36", label }: { value: number; total: number; size?: number; track?: string; color?: string; label?: ReactNode }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, value / total);
  return (
    <span className="relative inline-flex flex-none items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${value} sur ${total}`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} />
      </svg>
      <span className="relative text-[15px] font-bold" style={{ color }}>{label ?? `${value}/${total}`}</span>
    </span>
  );
}

/* ---------- Signaux (Safety UX) ---------- */

type SignalKind = Niveau | "attention" | "attentionPlein" | "succes" | "info";
const SIGNAL: Record<SignalKind, string> = {
  critique: "bg-danger-solid text-white border-danger-solid",
  eleve: "bg-danger-bg text-danger-text border-danger-border",
  modere: "bg-white text-danger-text border-danger-border",
  surveiller: "bg-veille-bg text-veille-text border-veille-border border-dashed",
  attention: "bg-attention-bg text-attention-text border-attention-icon",
  attentionPlein: "bg-attention-solid text-attention-on border-attention-solid",
  succes: "bg-succes-bg text-succes-text border-succes-border",
  info: "bg-info-bg text-info-text border-info-border",
};

export function Signal({ kind, children, icon = false }: { kind: SignalKind; children?: ReactNode; icon?: boolean }) {
  const text = children ?? (kind in LIBELLE_NIVEAU ? LIBELLE_NIVEAU[kind as Niveau] : "");
  return (
    <span className={cx("inline-flex flex-none items-center gap-1.5 self-start whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-[3px] text-xs font-bold", SIGNAL[kind])}>
      {icon && <SignalShape kind={kind} size={14} />}
      {text}
    </span>
  );
}

export function SignalShape({ kind, size = 18 }: { kind: SignalKind; size?: number }) {
  switch (kind) {
    case "critique": return <Octagon size={size} fill="#FFFFFF" mark="#951B27" />;
    case "eleve": return <Octagon size={size} fill="#C93A48" />;
    case "modere": return <Octagon size={size} fill="#FFFFFF" mark="#951B27" />;
    case "surveiller": return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#7189B5" strokeWidth={2} strokeDasharray="3 3" /></svg>;
    case "attention": return <Triangle size={size} />;
    case "attentionPlein": return <Triangle size={size} fill="#3B2600" mark="#E9A21B" />;
    case "succes": return <CircleCheck size={size} />;
    case "info": return <CircleInfo size={size} />;
  }
}

/* ---------- Illustrations ---------- */

export type IllusName = "maison" | "appareil" | "cles" | "ok" | "bulles" | "coureur" | "etoile" | "navigateur" | "mains" | "yoga" | "repere";

export function Illus({ name, width, className, alt = "" }: { name: IllusName; width: number; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/illustrations/${name}.png`} alt={alt} aria-hidden={alt ? undefined : true} width={width} className={cx("block h-auto select-none", className)} draggable={false} />;
}

export function Logo({ size = 48 }: { size?: number }) {
  // Logo entier (maison et cheminée), fond transparent, jamais recadré dans un rond.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-maison.png" alt="Chez Soi" width={size} height={size} className="flex-none object-contain" style={{ width: size, height: size }} />;
}

/* ---------- Badge agent ---------- */

export function AgentTag({ children, tone = "nuit" }: { children: ReactNode; tone?: "nuit" | "blanc" | "pervenche" }) {
  const cls = { nuit: "bg-nuit text-white", blanc: "bg-white text-nuit", pervenche: "bg-pervenche text-nuit" }[tone];
  return <span className={cx("inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold", cls)}><Cursor size={12} />{children}</span>;
}

/* ---------- Barre de navigation ---------- */

export type NavKey = "accueil" | "plan" | "agent" | "absence" | "suivi";
const NAV: { key: NavKey; label: string; chemin: string; icon: IconName | "agent" }[] = [
  { key: "accueil", label: "Accueil", chemin: "plan", icon: "home" },
  { key: "plan", label: "Plan", chemin: "actions", icon: "list" },
  { key: "agent", label: "Agent", chemin: "agent", icon: "agent" },
  { key: "absence", label: "Absence", chemin: "absence", icon: "cal" },
  { key: "suivi", label: "Suivi", chemin: "suivi", icon: "chart" },
];

/** Une proposition de l'agent attend la décision de l'utilisateur (demander_validation). */
export function useValidationEnAttente() {
  const { etat } = useParcours();
  return etat.run === "proposition" && !etat.decision;
}

export function BottomNav({ active }: { active: NavKey }) {
  const { logement } = useParcours();
  const enAttente = useValidationEnAttente();
  const base = `/logement/${logement.id}`;
  return (
    <nav aria-label="Navigation principale" className="fixed bottom-0 left-1/2 z-20 flex h-20 w-full max-w-[430px] -translate-x-1/2 items-center justify-around border-t border-line bg-white pb-1.5 md:absolute md:rounded-b-[44px]">
      {NAV.map((item) => {
        const on = item.key === active;
        const href = item.key === "agent" && enAttente ? `${base}/agent/validation` : `${base}/${item.chemin}`;
        return (
          <Link key={item.key} href={href} aria-current={on ? "page" : undefined} className={cx("relative flex min-w-[60px] flex-col items-center gap-[3px] text-xs", on ? "font-bold text-cobalt" : "font-semibold text-[#6B7390]")}>
            {item.icon === "agent" ? <Cursor size={22} filled={on} /> : <Icon name={item.icon} size={22} />}
            {item.label}
            <span className={cx("h-[5px] w-[5px] rounded-full", on ? "bg-cobalt" : "bg-transparent")} />
            {item.key === "agent" && enAttente && (
              <span className="absolute -top-0.5 right-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-attention-solid text-[11px] font-extrabold text-attention-on" aria-label="1 validation en attente">1</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Rappel discret sur le logement exemple : données fictives, rien n'est envoyé. */
export function ExempleTag() {
  return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-muted">Logement exemple · données fictives</span>;
}

/* ---------- Divers ---------- */

/** Zone d'action principale : collée en bas de l'écran, au-dessus de la barre de navigation quand il y en a une. */
export function ActionBar({ children, withNav }: { children: ReactNode; withNav?: boolean }) {
  return (
    <div className={cx("sticky z-10 -mx-5 mt-auto flex flex-col gap-2 bg-linear-to-t from-creme via-creme/95 to-creme/0 px-5 pt-4", withNav ? "bottom-20 pb-3" : "bottom-0 pb-1")}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[17px] font-bold">{children}</h2>
      {aside && <span className="text-[13px] font-bold text-cobalt">{aside}</span>}
    </div>
  );
}

export function Note({ icon = "lock", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[13px] leading-[18px] text-ink-muted">
      <Icon name={icon} size={18} className="mt-px text-cobalt" />
      <span>{children}</span>
    </p>
  );
}

export { cx };
