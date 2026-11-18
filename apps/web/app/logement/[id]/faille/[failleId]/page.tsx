"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Cursor, Icon } from "@/components/cs/icons";
import { BackButton, Header, Pill, RoundButton, Screen, Signal, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { libelleSource } from "@/lib/domaine";

const Viewer3D = dynamic(() => import("@/components/Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-pervenche" />,
});

/**
 * Écran 7 · Faille. Vue 3D de la pièce (Viewer3D : `.glb` du Space, ou pièce schématique à partir
 * des cotes), description, source, cote éditable puis confirmée par l'utilisateur.
 * La cote confirmée (`cote_confirmee_cm`) est l'entrée de l'usage 2 : l'agent la lit avec `get_mesures`.
 */
export default function PageFaille() {
  const { failleId } = useParams<{ failleId: string }>();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const f = logement.failles.find((x) => x.id === failleId);
  const [tourner, setTourner] = useState(false);
  const [apres, setApres] = useState(false);
  const [ar, setAr] = useState<string | null>(null);

  if (!f) return null;
  const piece = logement.pieces.find((p) => p.id === f.piece_id);
  const cote = etat.cotes[f.id];
  const setCote = (k: "largeur_cm" | "longueur_cm", v: number) =>
    maj({ cotes: { ...etat.cotes, [f.id]: { ...cote!, [k]: Math.max(10, v), confirmee: false } } });

  const testerAr = async () => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    const ok = xr ? await xr.isSessionSupported("immersive-ar").catch(() => false) : false;
    setAr(ok ? "Réalité augmentée disponible : bientôt dans Chez Soi." : "Réalité augmentée non disponible sur cet appareil.");
  };

  return (
    <Screen className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title={piece?.nom ?? "Faille"} right={<RoundButton icon="menu" label="Plan d'action" href={`${base}/actions`} />} />

      <section className="relative h-[300px] flex-none overflow-hidden rounded-card bg-pervenche">
        <Viewer3D
          modeleUrl={logement.pieces.find((p) => p.id === f.piece_id)?.modele_url ?? null}
          className="h-full w-full"
          tourner={tourner}
          apres={apres}
          objet={cote && f.element === "tapis" ? { largeur_cm: cote.largeur_cm, longueur_cm: cote.longueur_cm, libelle: f.titre } : null}
        />
        <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-white px-3 py-[7px] text-xs font-bold">Vous êtes ici</span>
        <span className="pointer-events-none absolute top-4 right-4">{apres ? <Signal kind="succes">Après</Signal> : <Signal kind={f.niveau} />}</span>
        <span className="pointer-events-none absolute bottom-3 left-4 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
          {f.origine === "pipeline" ? "Mesuré sur votre vidéo" : f.origine === "precalcule" ? "Modèle précalculé" : "Saisie manuelle"}
        </span>
        {ar && (
          <button type="button" onClick={() => setAr(null)} className="absolute inset-x-4 top-14 rounded-[18px] bg-white px-3 py-2 text-center text-xs font-semibold">
            {ar}
          </button>
        )}
      </section>

      <div className="-mt-0.5 flex items-center justify-center gap-5">
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="ar" label="Voir en réalité augmentée" size={54} onClick={testerAr} />
          <span className="text-xs font-semibold">AR</span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="rotate" label="Tourner la vue" size={70} variant="nuit" onClick={() => setTourner((v) => !v)} />
          <span className="text-xs font-semibold">Tourner</span>
        </span>
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="compare" label="Avant et après" size={54} variant={apres ? "pervenche" : "blanc"} onClick={() => setApres((v) => !v)} />
          <span className="text-xs font-semibold">Avant/après</span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{f.titre}</h1>
        <p className="text-sm leading-5 text-ink-muted">{f.description}</p>
        {f.source.force === "loi" ? (
          <a href={f.source.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-cobalt underline">
            {libelleSource(f.source)}
          </a>
        ) : (
          <span className="text-[13px] font-semibold text-cobalt" title={f.source.force === "contrat" ? f.source.clause : undefined}>
            {libelleSource(f.source)}
          </span>
        )}
      </div>

      {cote && f.cote && (
        <section className={cx("flex flex-col gap-2 rounded-[26px] border-2 bg-white px-3.5 py-3", cote.confirmee ? "border-succes-border" : "border-attention-icon")}>
          <div className="flex items-center justify-between">
            <b className="text-sm">{f.cote.libelle}</b>
            {cote.confirmee ? <Signal kind="succes">Confirmée</Signal> : <Signal kind="attention">À confirmer</Signal>}
          </div>
          {([["largeur_cm", "Largeur"], ["longueur_cm", "Longueur"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">{label}</span>
              <span className="flex items-center gap-2">
                <RoundButton icon="minus" label={`Réduire la ${label.toLowerCase()}`} size={40} onClick={() => setCote(k, cote[k] - 5)} />
                <b className="min-w-16 text-center text-[17px]" aria-live="polite">{cote[k]} cm</b>
                <RoundButton icon="plus" label={`Augmenter la ${label.toLowerCase()}`} size={40} onClick={() => setCote(k, cote[k] + 5)} />
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="mt-auto">
        {cote && !cote.confirmee ? (
          <Pill onClick={() => maj({ cotes: { ...etat.cotes, [f.id]: { ...cote, confirmee: true } } })}>
            <Icon name="check" size={18} />
            Je confirme {cote.largeur_cm} × {cote.longueur_cm} cm
          </Pill>
        ) : (
          <Pill href={`${base}/actions`}>
            <Cursor size={16} />
            {cote ? "Cote prête pour l'agent" : "Voir le plan d'action"}
          </Pill>
        )}
      </div>
    </Screen>
  );
}
