"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Cursor } from "@/components/cs/icons";
import { ActionBar, BackButton, Chip, Header, Illus, Pill, RoundButton, Screen, Signal, cx } from "@/components/cs/ui";
import { ETAPES_AGENT_EXEMPLE } from "@/lib/demo/logement-exemple";
import { useParcours } from "@/lib/demo/etat";

const CONSIGNES = ["sans découpe", "livraison rapide", "lavable"];

/**
 * Écran 9 · Agent. Logement exemple : replay du run réel du 18/11 (IKEA France, PR #9),
 * sans session H. Vrai logement : session créée par `/api/agent/run`, suivie par webhook.
 * Pilotage : la consigne part à la session par `/api/agent/steer`. Arrêt par `demander_validation`.
 */
export default function PageAgent() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const coteTapis = Object.values(etat.cotes)[0];
  const [consignes, setConsignes] = useState<string[]>([]);
  const etapes = useMemo(() => {
    const e = [`Cote lue dans votre plan : ${coteTapis?.largeur_cm ?? 60} × ${coteTapis?.longueur_cm ?? 160} cm`, ...ETAPES_AGENT_EXEMPLE.slice(1)];
    for (const c of consignes) e.splice(e.length - 1, 0, `Consigne reçue : ${c}`);
    return e;
  }, [coteTapis?.largeur_cm, coteTapis?.longueur_cm, consignes]);
  const [step, setStep] = useState(0);
  const [pause, setPause] = useState(false);
  const [texte, setTexte] = useState("");

  const fini = etat.run === "proposition" || etat.run === "termine";
  const aucun = etat.run === "aucun";
  const actif = etat.run === "en_cours" && !pause;

  useEffect(() => {
    if (!actif) return;
    const t = window.setInterval(() => setStep((s) => s + 1), 1600);
    return () => window.clearInterval(t);
  }, [actif]);

  useEffect(() => {
    if (etat.run === "en_cours" && step >= etapes.length - 1) maj({ run: "proposition" });
  }, [etat.run, step, etapes.length, maj]);

  const courant = fini ? etapes.length - 1 : Math.min(step, etapes.length - 1);
  const piloter = (c: string) => {
    const t = c.trim();
    if (t && !consignes.includes(t)) setConsignes((l) => [...l, t]);
    setTexte("");
  };
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    piloter(texte);
  };

  return (
    <Screen nav="agent" className="gap-3">
      <Header left={<BackButton href={`${base}/actions`} />} title="Agent Chez Soi" right={<RoundButton icon="menu" label="Plan d'action" href={`${base}/actions`} />} />

      {aucun ? (
        <section className="flex flex-col items-center gap-3 rounded-card bg-pervenche p-6 text-center">
          <Illus name="navigateur" width={110} />
          <b className="text-lg">Aucune mission en cours</b>
          <p className="text-sm text-ink-soft">Choisissez dans le plan d&apos;action ce que l&apos;agent prépare pour vous.</p>
          <Pill href={`${base}/actions`} variant="blanc">Choisir les missions</Pill>
        </section>
      ) : (
        <>
          <section className="relative h-[318px] flex-none overflow-hidden rounded-card bg-pervenche">
            <span className="absolute top-[18px] left-[18px] flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-pervenche bg-white text-xs font-extrabold">IKEA</span>
            </span>
            <span className="absolute top-[18px] right-[18px]">
              {fini ? <Signal kind="attentionPlein" icon>Validation attendue</Signal> : pause ? <Signal kind="info">En pause</Signal> : <Signal kind="info" icon>En cours</Signal>}
            </span>
            <Illus name="navigateur" width={126} className="absolute top-[62px] left-1/2 -translate-x-1/2" />
            <p className="absolute top-[168px] left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">
              {fini ? "Proposition prête. Rien n'est acheté." : "Je compare les sous-tapis pour le couloir"}
            </p>
            <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-5">
              <RoundButton icon={pause ? "play" : "pause"} label={pause ? "Reprendre" : "Mettre en pause"} size={54} onClick={() => setPause(!pause)} />
              <RoundButton icon="eye" label="Voir le navigateur de l'agent" size={74} variant="nuit" className="border-[5px] border-white/70" />
              <RoundButton icon="stop" label="Arrêter l'agent" size={54} href={`${base}/actions`} onClick={() => maj({ run: "aucun" })} />
            </div>
          </section>

          <p className="flex justify-between text-[13px] text-ink-muted">
            <span className="flex items-center gap-1.5 font-semibold">
              <Cursor size={13} className="text-cobalt" />
              {logement.exemple ? "Replay du run du 18/11 · IKEA" : "Usage 2 · session en direct"}
            </span>
            <span>Propulsé par H Company</span>
          </p>

          <form onSubmit={envoyer} className="flex items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-[18px]">
            <label htmlFor="steer" className="sr-only-focusable">Consigne pour l&apos;agent</label>
            <input id="steer" value={texte} onChange={(e) => setTexte(e.target.value)} disabled={fini} maxLength={200} placeholder="Demandez-lui, ex. sans découpe" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-50" />
            <button type="submit" aria-label="Envoyer la consigne" disabled={fini || !texte.trim()} className="flex h-11 w-11 items-center justify-center rounded-full bg-nuit text-white disabled:opacity-40">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M4 12l16-8-6 16-2-7z" /></svg>
            </button>
          </form>
          <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
            {CONSIGNES.map((c) => (
              <Chip key={c} active={consignes.includes(c)} onClick={fini ? undefined : () => piloter(c)}>{c}</Chip>
            ))}
          </div>

          <ol className="flex flex-col gap-0.5" aria-label="Étapes de l'agent">
            {etapes.map((e, i) => {
              const done = i < courant || fini;
              const now = i === courant && !fini;
              return (
                <li key={e} className="flex items-start gap-3 py-[5px]">
                  <span className={cx("mt-0.5 h-4 w-4 flex-none rounded-full border-2", done ? "border-succes-solid bg-succes-solid" : now ? "anim-pulse border-info-solid bg-pervenche-soft" : "border-[#8C8068] bg-white")} />
                  <span className={cx("text-sm leading-5", now ? "font-bold text-cobalt" : done ? "" : "text-ink-muted")}>{e}</span>
                </li>
              );
            })}
          </ol>
          {logement.exemple && consignes.length > 0 && <p className="text-xs text-ink-muted">Dans ce replay, vos consignes sont notées mais pas envoyées à une vraie session.</p>}
        </>
      )}

      {!aucun && (
        <ActionBar withNav>
          <Pill href={`${base}/agent/validation`} variant={fini ? "nuit" : "contour"}>{fini ? "Voir le résultat" : "Voir le résultat dès qu'il est prêt"}</Pill>
        </ActionBar>
      )}
    </Screen>
  );
}
