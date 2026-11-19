"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import { CircleCheck, Cursor, Icon, type IconName } from "@/components/cs/icons";
import { ActionBar, BackButton, Chip, Header, Illus, OptionsMenu, Pill, RoundButton, Screen, Sheet, Signal, cx, useToast } from "@/components/cs/ui";
import { runTermine, useRunAgent } from "@/lib/agent/client";
import { ETAPES_AGENT_EXEMPLE } from "@/lib/demo/logement-exemple";
import { useParcours } from "@/lib/demo/etat";

const CONSIGNES = ["sans découpe", "livraison rapide", "lavable"];

// Ce que l'agent peut faire et ce qu'il ne fait jamais (arrêt garanti par `demander_validation`).
const DROITS = ["Lire les fiches produit et comparer les prix", "Vérifier une dimension sur la fiche, avec la citation", "Préparer un panier, puis s'arrêter"];
const INTERDITS = ["payer ou passer commande", "envoyer un message ou un formulaire", "signer ou se connecter à votre place"];

/**
 * Écran 9 · Agent. Logement exemple : replay du run réel du 18/11 (IKEA France, PR #9),
 * sans session H. Vrai logement : session créée par `/api/agent/run`, suivie ici par
 * `GET /api/agent/run?id=` (toutes les 3 s). Pilotage : la consigne part à la session par
 * `/api/agent/steer`. Arrêt par `demander_validation` : l'écran Validation prend le relais.
 */
export default function PageAgent() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const coteTapis = Object.values(etat.cotes)[0];
  const [consignes, setConsignes] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [pause, setPause] = useState(false);
  const [texte, setTexte] = useState("");
  const [alerte, setAlerte] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<"droits" | "navigateur">();
  const router = useRouter();
  const toast = useToast();

  // Vrai logement : l'état vient de la session H, jamais d'une animation.
  const reel = !logement.exemple;
  const suivi = useRunAgent(reel && etat.run !== "aucun" ? etat.sessionId : null);
  const termine = runTermine(suivi.etat);
  const validationAttendue = Boolean(suivi.etat?.validation_en_attente);
  const coupe = Boolean(suivi.etat?.run.coupe_circuit);

  const etapes = useMemo(() => {
    if (reel) {
      const e = ["Session ouverte chez H, sans connexion à aucun compte", "Cotes et contraintes lues dans votre plan", "Recherche et vérification de la dimension sur la fiche"];
      for (const c of consignes) e.push(`Consigne envoyée : ${c}`);
      e.push("Produit au panier, validation demandée");
      return e;
    }
    const e = [`Cote lue dans votre plan : ${coteTapis?.largeur_cm ?? 60} × ${coteTapis?.longueur_cm ?? 160} cm`, ...ETAPES_AGENT_EXEMPLE.slice(1)];
    for (const c of consignes) e.splice(e.length - 1, 0, `Consigne reçue : ${c}`);
    return e;
  }, [reel, coteTapis?.largeur_cm, coteTapis?.longueur_cm, consignes]);

  const fini = etat.run === "proposition" || etat.run === "termine";
  const aucun = etat.run === "aucun";
  const actif = !reel && etat.run === "en_cours" && !pause;

  useEffect(() => {
    if (!actif) return;
    const t = window.setInterval(() => setStep((s) => s + 1), 1600);
    return () => window.clearInterval(t);
  }, [actif]);

  useEffect(() => {
    if (!reel && etat.run === "en_cours" && step >= etapes.length - 1) maj({ run: "proposition" });
  }, [reel, etat.run, step, etapes.length, maj]);

  // Vrai logement : la session décide de l'étape affichée et de la suite du parcours.
  useEffect(() => {
    if (!reel || etat.run === "aucun") return;
    if (validationAttendue && etat.run !== "proposition") maj({ run: "proposition", decision: null });
    else if (termine && !validationAttendue && etat.run !== "termine") maj({ run: "termine" });
  }, [reel, etat.run, validationAttendue, termine, maj]);

  const etapesHAi = suivi.etat?.run.nb_etapes ?? 0;
  const courantReel = validationAttendue || termine ? etapes.length - 1 : !suivi.etat ? 0 : etapesHAi > 0 || suivi.etat.run.statut_final === "running" ? 2 : 1;
  const courant = reel ? courantReel : fini ? etapes.length - 1 : Math.min(step, etapes.length - 1);
  const echec = reel && termine && !validationAttendue && (coupe || suivi.etat?.run.statut_final !== "completed" || !suivi.etat?.run.decision_validation);

  // Fin sans proposition : la raison donnée par l'agent (« le site ne vend pas… ») vaut mieux qu'un message générique.
  const remarque = (suivi.etat?.run.sortie_finale as { remarque?: string } | null | undefined)?.remarque?.trim();

  const piloter = async (c: string) => {
    const t = c.trim();
    setTexte("");
    if (!t || consignes.includes(t)) return;
    if (reel) {
      if (!etat.sessionId) return;
      setAlerte(null);
      const r = await fetch("/api/agent/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: etat.sessionId, message: t }),
      }).catch(() => null);
      if (!r || !r.ok) {
        const corps = r ? ((await r.json().catch(() => null)) as { message?: string } | null) : null;
        setAlerte(corps?.message ?? "La consigne n'a pas pu être envoyée.");
        return;
      }
    }
    setConsignes((l) => [...l, t]);
  };
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    void piloter(texte);
  };

  // Relancer et arrêter ne pilotent que le replay : une vraie session se relance depuis le plan d'action.
  const options: { label: string; icon: IconName; onClick: () => void; danger?: boolean }[] = [
    { label: "Ce que l'agent a le droit de faire", icon: "shield", onClick: () => setFeuille("droits") },
    ...(!reel && !aucun
      ? [
          { label: "Voir le navigateur du replay", icon: "eye" as const, onClick: () => setFeuille("navigateur") },
          { label: "Rejouer la recherche", icon: "refresh" as const, onClick: () => { setStep(0); setPause(false); setConsignes([]); maj({ run: "en_cours", decision: null }); toast.show("Recherche relancée"); } },
          { label: "Arrêter l'agent", icon: "stop" as const, danger: true, onClick: () => { maj({ run: "aucun" }); router.push(`${base}/actions`); } },
        ]
      : []),
    { label: "Retour au plan d'action", icon: "list", onClick: () => router.push(`${base}/actions`) },
  ];

  return (
    <Screen nav="agent" className="gap-3">
      <Header left={<BackButton href={`${base}/actions`} />} title="Agent Chez Soi" right={<OptionsMenu label="Options de l'agent" items={options} />} />

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
              {echec ? <Signal kind="info">Arrêté</Signal> : fini && etat.run === "termine" ? <Signal kind="info">Terminé</Signal> : fini ? <Signal kind="attentionPlein" icon>Validation attendue</Signal> : pause ? <Signal kind="info">En pause</Signal> : <Signal kind="info" icon>En cours</Signal>}
            </span>
            <Illus name="navigateur" width={126} className={cx("absolute top-[62px] left-1/2 -translate-x-1/2", !fini && !echec && !pause && "anim-float")} />
            <p key={`${echec}-${fini}`} className="anim-in absolute top-[168px] left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">
              {echec
                ? coupe ? "Session coupée : page non autorisée." : "L'agent s'est arrêté sans proposition."
                : fini ? "Proposition prête. Rien n'est acheté." : reel ? "Je cherche le produit sur IKEA" : "Je compare les sous-tapis pour le couloir"}
            </p>
            {/* Pause, aperçu et arrêt ne pilotent que le replay : sur une vraie session, ils ne feraient rien chez H. */}
            {!reel && (
              <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-5">
                <RoundButton icon={pause ? "play" : "pause"} label={pause ? "Reprendre" : "Mettre en pause"} size={54} onClick={() => setPause(!pause)} />
                <RoundButton icon="eye" label="Voir le navigateur de l'agent" size={74} variant="nuit" className="border-[5px] border-white/70" onClick={() => setFeuille("navigateur")} />
                <RoundButton icon="stop" label="Arrêter l'agent" size={54} href={`${base}/actions`} onClick={() => maj({ run: "aucun" })} />
              </div>
            )}
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
              <Chip key={c} active={consignes.includes(c)} onClick={fini ? undefined : () => void piloter(c)}>{c}</Chip>
            ))}
          </div>

          {(alerte ?? suivi.erreur) && <p role="alert" className="rounded-[20px] bg-attention-bg px-4 py-3 text-sm font-semibold text-attention-text">{alerte ?? suivi.erreur}</p>}
          {reel && !etat.sessionId && <p role="alert" className="rounded-[20px] bg-attention-bg px-4 py-3 text-sm font-semibold text-attention-text">Session introuvable : relancez la mission depuis le plan d&apos;action.</p>}

          {echec && remarque && (
            <section role="status" className="flex flex-col gap-1 rounded-[26px] bg-white px-4 py-3.5">
              <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Ce que dit l&apos;agent</span>
              <p className="text-sm leading-5">{remarque}</p>
            </section>
          )}

          <ol className="flex flex-col gap-0.5" aria-label="Étapes de l'agent">
            {etapes.map((e, i) => {
              const done = !echec && (i < courant || fini);
              const now = !echec && i === courant && !fini;
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
          {echec ? (
            <Pill href={`${base}/actions`} onClick={() => maj({ run: "aucun", sessionId: null })}>Retour au plan d&apos;action</Pill>
          ) : (
            <Pill href={`${base}/agent/validation`} variant={fini ? "nuit" : "contour"}>{fini ? "Voir le résultat" : "Voir le résultat dès qu'il est prêt"}</Pill>
          )}
        </ActionBar>
      )}

      <Sheet open={feuille === "droits"} onClose={() => setFeuille(undefined)} title="Ce que l'agent a le droit de faire">
        <ul className="flex flex-col gap-2.5 text-sm leading-5">
          {DROITS.map((x) => (
            <li key={x} className="flex items-start gap-2.5"><CircleCheck size={20} />{x}</li>
          ))}
          {INTERDITS.map((x) => (
            <li key={x} className="flex items-start gap-2.5">
              <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full bg-nuit text-white"><Icon name="close" size={12} strokeWidth={3} /></span>
              Jamais : {x}
            </li>
          ))}
        </ul>
        <p className="rounded-xl2 bg-info-bg px-4 py-3 text-[13px] leading-[18px] font-semibold text-info-text">Avant toute action engageante, l&apos;agent s&apos;arrête et attend votre validation.</p>
      </Sheet>

      <Sheet open={feuille === "navigateur"} onClose={() => setFeuille(undefined)} title="Navigateur de l'agent">
        <div className="overflow-hidden rounded-xl2 border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line bg-creme px-3 py-2.5 text-xs font-semibold text-ink-muted">
            <Icon name="lock" size={14} /><span className="truncate">ikea.com/fr · sous-tapis antidérapant</span>
          </div>
          <div className="relative flex h-[170px] items-center justify-center bg-pervenche-soft">
            <Illus name="navigateur" width={110} className={cx(!fini && "anim-float")} />
          </div>
          <p key={courant} className="anim-in flex items-center gap-2 px-3.5 py-3 text-sm font-bold text-cobalt"><Cursor size={14} />{etapes[courant]}</p>
        </div>
        <p className="text-xs leading-[17px] text-ink-muted">Replay du run du 18/11. L&apos;agent ne voit jamais vos mots de passe ni vos moyens de paiement.</p>
      </Sheet>
      {toast.node}
    </Screen>
  );
}
