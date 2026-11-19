"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Cursor, Icon } from "@/components/cs/icons";
import { BackButton, Header, OptionsMenu, Pill, RoundButton, Screen, Sheet, Signal, cx, useToast } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { libelleSource, type Faille } from "@/lib/domaine";

import { confirmerCote, retirerPoint } from "../../actions-serveur";

/** Tapis repéré sans cote estimée par la vision : point de départ que l'utilisateur ajuste. */
const COTE_PAR_DEFAUT = { largeur_cm: 60, longueur_cm: 90, confirmee: false };

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
  const [envoi, setEnvoi] = useState(false);
  // La photo annotée (vue de la vidéo, objet encadré) est ce qu'on reconnaît tout de suite ; la 3D reste à un geste.
  const [vue, setVue] = useState<"photo" | "3d">("photo");
  const [erreur, setErreur] = useState<string | null>(null);

  const [signaler, setSignaler] = useState(false);
  const [retrait, setRetrait] = useState(false);

  const toast = useToast();
  const router = useRouter();
  if (!f) return null;
  const piece = logement.pieces.find((p) => p.id === f.piece_id);
  const photo = piece?.image_url ?? null;
  // Vrai logement : un tapis reste mesurable même si la vision n'a pas estimé sa cote.
  const cote = etat.cotes[f.id] ?? (!logement.exemple && f.element === "tapis" ? COTE_PAR_DEFAUT : undefined);
  const setCote = (k: "largeur_cm" | "longueur_cm", v: number) =>
    maj({ cotes: { ...etat.cotes, [f.id]: { ...cote!, [k]: Math.max(10, v), confirmee: false } } });

  /** Vrai logement : la cote est écrite en base avant d'être dite « confirmée » (lue par get_mesures). */
  const confirmer = async () => {
    if (!cote) return;
    setErreur(null);
    if (!logement.exemple) {
      setEnvoi(true);
      const r = await confirmerCote({ logement_id: logement.id, faille_id: f.id, largeur_cm: cote.largeur_cm, longueur_cm: cote.longueur_cm }).catch(
        () => ({ ok: false as const, message: "Cote non enregistrée." }),
      );
      setEnvoi(false);
      if (!r.ok) {
        setErreur(r.message ?? "Cote non enregistrée.");
        return;
      }
    }
    maj({ cotes: { ...etat.cotes, [f.id]: { ...cote, confirmee: true } } });
  };

  const testerAr = async () => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    const ok = xr ? await xr.isSessionSupported("immersive-ar").catch(() => false) : false;
    setAr(ok ? "Réalité augmentée disponible : bientôt dans Chez Soi." : "Réalité augmentée non disponible sur cet appareil.");
  };

  // Partage réel : un résumé du point par le partage du téléphone (ou le presse-papiers), sans lien d'accès au logement.
  const partager = async () => {
    const texte = [
      `Chez Soi · ${piece?.nom ?? "Logement"} : ${f.titre}`,
      cote ? `Dimensions : ${cote.largeur_cm} × ${cote.longueur_cm} cm` : null,
      f.description,
      libelleSource(f.source),
    ].filter(Boolean).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: `Chez Soi · ${f.titre}`, text: texte });
      else {
        await navigator.clipboard.writeText(texte);
        toast.show("Résumé copié, prêt à coller");
      }
    } catch {
      // Partage annulé par l'utilisateur : rien à signaler.
    }
  };

  // « Signaler une erreur de détection » : le point repéré par la vision est faux (le sol pris pour un tapis…).
  const retirer = async () => {
    if (logement.exemple) {
      setSignaler(false);
      return toast.show("Merci, on vérifie ce point");
    }
    setRetrait(true);
    const r = await retirerPoint(logement.id, f.id);
    if (!r.ok) {
      setRetrait(false);
      setSignaler(false);
      return toast.show(r.message ?? "Point non retiré");
    }
    router.push(`${base}/plan`);
    router.refresh();
  };

  return (
    <Screen className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title={piece?.nom ?? "Faille"} right={<OptionsMenu label="Options du point" items={[
        { label: "Partager avec un proche", icon: "share", onClick: () => void partager() },
        { label: "Signaler une erreur de détection", icon: "police", onClick: () => setSignaler(true) },
        { label: "Voir le plan d'action", icon: "list", onClick: () => router.push(`${base}/actions`) },
      ]} />} />

      <section className="relative h-[300px] flex-none overflow-hidden rounded-card bg-pervenche">
        {photo && vue === "photo" ? (
          f.vignette ? (
            <PhotoDuPoint src={photo} vignette={f.vignette} alt={`${f.titre} sur votre vidéo, encadré avec sa cote`} coteConfirmee={cote?.confirmee ? `${f.titre.toLowerCase()} ${cote.largeur_cm} × ${cote.longueur_cm} cm` : null} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée de courte durée, hors du loader d'images
            <img src={photo} alt={`Votre ${piece?.nom?.toLowerCase() ?? "pièce"} filmée : les éléments repérés sont encadrés`} className="h-full w-full bg-nuit object-contain" />
          )
        ) : (
        <Viewer3D
          modeleUrl={logement.pieces.find((p) => p.id === f.piece_id)?.modele_url ?? null}
          className="h-full w-full"
          tourner={tourner}
          apres={apres}
          repere={f.repere_3d ? { position: f.repere_3d, libelle: f.titre } : null}
          relief={f.relief ?? null}
          objet={cote && f.element === "tapis" ? { largeur_cm: cote.largeur_cm, longueur_cm: cote.longueur_cm, libelle: f.titre } : null}
        />
        )}
        {photo && (
          <div className="absolute bottom-3 right-4 flex rounded-full bg-white/90 p-1" role="radiogroup" aria-label="Type de vue">
            {(["photo", "3d"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={vue === v} onClick={() => setVue(v)} className={cx("h-8 rounded-full px-3 text-xs font-bold", vue === v ? "bg-nuit text-white" : "text-ink-muted")}>
                {v === "photo" ? "Photo" : "3D"}
              </button>
            ))}
          </div>
        )}
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
        {/* AR et avant/après n'agissent que sur la pièce schématique du logement exemple : sur un vrai logement, ils ne faisaient rien. */}
        {logement.exemple && (
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="ar" label="Voir en réalité augmentée" size={54} onClick={testerAr} />
          <span className="text-xs font-semibold">AR</span>
        </span>
        )}
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="rotate" label="Tourner la vue" size={70} variant="nuit" onClick={() => setTourner((v) => !v)} />
          <span className="text-xs font-semibold">Tourner</span>
        </span>
{logement.exemple && (
        <span className="flex flex-col items-center gap-1">
          <RoundButton icon="compare" label="Avant et après" size={54} variant={apres ? "pervenche" : "blanc"} onClick={() => setApres((v) => !v)} />
          <span className="text-xs font-semibold">Avant/après</span>
        </span>
        )}
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

      {cote && (
        <section className={cx("flex flex-col gap-2 rounded-[26px] border-2 bg-white px-3.5 py-3", cote.confirmee ? "border-succes-border" : "border-attention-icon")}>
          <div className="flex items-center justify-between">
            <b className="text-sm">{f.cote?.libelle ?? "Dimensions à mesurer"}</b>
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
          <>
            {erreur && <p role="alert" className="mb-2 text-center text-[13px] font-semibold text-ink-muted">{erreur}</p>}
            <Pill onClick={confirmer} disabled={envoi}>
              <Icon name="check" size={18} />
              {envoi ? "Enregistrement…" : `Je confirme ${cote.largeur_cm} × ${cote.longueur_cm} cm`}
            </Pill>
          </>
        ) : (
          <Pill href={`${base}/actions`}>
            <Cursor size={16} />
            {cote ? "Cote prête pour l'agent" : "Voir le plan d'action"}
          </Pill>
        )}
      </div>
      <Sheet open={signaler} onClose={() => setSignaler(false)} title="Erreur de détection ?">
        <p className="text-sm leading-5 text-ink-soft">
          Ce n&apos;est pas {f.titre.toLowerCase().startsWith("tapis") ? "un tapis" : "ce que l'analyse a cru voir"} ? Le point est retiré du plan, avec son action. Une nouvelle vidéo de la pièce peut le faire revenir s&apos;il est bien là.
        </p>
        <Pill onClick={() => void retirer()} disabled={retrait}>{retrait ? "Retrait…" : "Retirer ce point"}</Pill>
        <button type="button" onClick={() => setSignaler(false)} className="h-10 text-sm font-bold">Annuler</button>
      </Sheet>
      {toast.node}
    </Screen>
  );
}

/**
 * Photo d'un point : sa tranche dans la planche de vignettes empilées (une par point), en pleine largeur
 * et cadrée sur l'élément. Les unités `cqw`/`cqh` sont celles du cadre : la tranche garde ses proportions.
 */
function PhotoDuPoint({ src, vignette, alt, coteConfirmee }: { src: string; vignette: NonNullable<Faille["vignette"]>; alt: string; coteConfirmee?: string | null }) {
  const r = vignette.hauteur / vignette.largeur;
  const tranche = `calc(100cqw * ${r})`;
  const [x1, y1, , y2] = vignette.boite ?? [0, 0.25, 1, 0.75];
  // Élément plus haut que le cadre : on montre son sommet et son libellé ; sinon on le centre.
  const haut = (y2 - y1) * r > 0.6 ? Math.max(0, y1 - 0.06) : null;
  const decalage = haut != null ? `calc(100cqw * ${-(haut * r).toFixed(4)})` : `calc(50cqh - 100cqw * ${(((y1 + y2) / 2) * r).toFixed(4)})`;
  return (
    <div className="relative h-full w-full overflow-hidden bg-nuit" style={{ containerType: "size" }}>
      <div className="absolute left-0 w-full overflow-hidden" style={{ height: tranche, top: `clamp(min(0px, calc(100cqh - ${tranche})), ${decalage}, 0px)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL signée de courte durée, hors du loader d'images */}
        <img src={src} alt={alt} className="absolute top-0 left-0 w-full max-w-none" style={{ transform: `translateY(-${(vignette.index * 100) / vignette.total}%)` }} />
        {/* La photo porte l'estimation de la vidéo ; une fois la cote confirmée, son étiquette est recouverte par la cote confirmée. */}
        {coteConfirmee && (
          <span
            className="absolute box-border bg-[#FF8A00] leading-none whitespace-nowrap text-black"
            style={{
              left: `${(x1 * 100).toFixed(2)}%`,
              top: `calc(100cqw * ${r} * ${y1.toFixed(4)} - 100cqw * 0.074)`,
              height: "calc(100cqw * 0.074)",
              fontSize: "calc(100cqw * 0.038)",
              padding: "calc(100cqw * 0.017)",
              minWidth: "calc(100cqw * 0.36)",
            }}
          >
            {coteConfirmee}
          </span>
        )}
      </div>
    </div>
  );
}
