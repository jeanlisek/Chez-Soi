"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CircleCheck, Icon } from "@/components/cs/icons";
import { AgentTag, BackButton, Header, Illus, Pill, RoundButton, Screen, SectionTitle, Signal, cx, useToast } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { clientNavigateur } from "@/lib/supabase/client";

// Ce que fait le pipeline vision pendant l'attente (images, profondeur, détection, cotes).
const PENDANT = [
  "On découpe chaque vidéo en images nettes.",
  "On reconstruit la pièce en 3D, à l'échelle.",
  "On repère tapis, portes, fenêtres et passages.",
  "On calcule les cotes de chaque élément.",
];

type EtatPiece = { etat: "en_attente" | "en_cours" | "terminee" | "echec"; libelle: string; pct: number };

/**
 * Écran 5 · Analyse. Avancement par pièce (une analyse par vidéo, table `analyses`) et, en parcours A,
 * l'agent H qui retrouve les conditions générales de l'assureur (usage 1).
 * Logement exemple : l'avancement est rejoué sur les résultats déjà calculés.
 */
export default function PageAnalyse() {
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;
  const [tick, setTick] = useState(0);
  const toast = useToast();
  const router = useRouter();
  const [prevenir, setPrevenir] = useState(false);
  const [message, setMessage] = useState(0);
  const [reels, setReels] = useState<{ piece: string | null; statut: string; erreur: string | null }[] | null>(null);

  useEffect(() => {
    if (!logement.exemple) return;
    const t = window.setInterval(() => setTick((x) => (x < 60 ? x + 1 : x)), 200);
    return () => window.clearInterval(t);
  }, [logement.exemple]);

  // Vrai logement : état des analyses lu dans Supabase (RLS), toutes les 5 secondes.
  useEffect(() => {
    if (logement.exemple) return;
    const supabase = clientNavigateur();
    if (!supabase) return;
    let actif = true;
    const lire = async () => {
      const { data } = await supabase
        .from("analyses")
        .select("piece, statut, erreur, created_at")
        .eq("logement_id", logement.id)
        .eq("type", "video")
        .order("created_at", { ascending: false });
      if (actif && data) setReels(data);
    };
    void lire();
    const id = window.setInterval(lire, 5000);
    return () => {
      actif = false;
      window.clearInterval(id);
    };
  }, [logement.exemple, logement.id]);

  const etatPiece = (nom: string, i: number): EtatPiece => {
    if (logement.exemple) {
      const v = Math.max(0, Math.min(100, (tick - i * 8) * 8));
      return v >= 100 ? { etat: "terminee", libelle: "en 3D", pct: 100 } : v > 0 ? { etat: "en_cours", libelle: `cotes ${v} %`, pct: v } : { etat: "en_attente", libelle: "en attente", pct: 0 };
    }
    const a = reels?.find((r) => r.piece === nom);
    if (!a) return { etat: "en_attente", libelle: "en attente", pct: 0 };
    if (a.statut === "termine" || a.statut === "terminee") return { etat: "terminee", libelle: "points et cotes", pct: 100 };
    if (a.statut === "echec") return { etat: "echec", libelle: "échec, refilmez", pct: 0 };
    if (a.statut === "en_cours") return { etat: "en_cours", libelle: "analyse en cours", pct: 55 };
    return { etat: "en_attente", libelle: "en attente du service", pct: 0 };
  };

  const pieces = logement.pieces.map((p, i) => ({ p, e: etatPiece(p.nom, i) }));
  const finies = pieces.filter(({ e }) => e.etat === "terminee").length;
  const contrat = etat.parcours === "A" ? logement.contrat : null;
  const agentFini = logement.exemple ? tick > 18 : false;
  const fini = pieces.length > 0 && finies === pieces.length;
  const enCours = pieces.some(({ e }) => e.etat === "en_cours");
  const points = logement.failles.length;

  // Vrai logement : à la fin, on recharge les points repérés (lus côté serveur) pour afficher le bon compte.
  useEffect(() => {
    if (fini && !logement.exemple) router.refresh();
  }, [fini, logement.exemple, router]);

  // Le message d'attente tourne tant qu'une analyse est en cours.
  useEffect(() => {
    if (!enCours) return;
    const t = window.setInterval(() => setMessage((m) => (m + 1) % PENDANT.length), 4000);
    return () => window.clearInterval(t);
  }, [enCours]);

  // « Me prévenir à la fin » : notification du navigateur si elle est autorisée, sinon message sur la page.
  useEffect(() => {
    if (!fini || !prevenir) return;
    setPrevenir(false);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Chez Soi", { body: "Le diagnostic est prêt." });
    else toast.show("Le diagnostic est prêt");
  }, [fini, prevenir, toast]);

  const basculerPrevenir = async () => {
    if (prevenir) {
      setPrevenir(false);
      toast.show("Notification annulée");
      return;
    }
    setPrevenir(true);
    const autorisee = typeof Notification !== "undefined" && (Notification.permission === "granted" || (Notification.permission === "default" && (await Notification.requestPermission()) === "granted"));
    toast.show(autorisee ? "On vous prévient à la fin" : "Gardez cette page ouverte : on vous prévient ici");
  };

  return (
    <Screen className="gap-3.5">
      <Header left={<BackButton href={`${base}/capture`} />} title="Analyse" right={fini ? undefined : <RoundButton icon="bell" label={prevenir ? "Je serai prévenu à la fin" : "Me prévenir à la fin"} variant={prevenir ? "nuit" : "blanc"} onClick={() => void basculerPrevenir()} />} />

      <section className="relative h-[262px] flex-none overflow-hidden rounded-card bg-pervenche">
        <span className="absolute top-[18px] left-[18px]"><AgentTag>Agent · usage 1</AgentTag></span>
        <span key={`${Boolean(contrat)}-${agentFini}`} className="anim-pop absolute top-[18px] right-[18px]">
          {!contrat ? <Signal kind="surveiller">Parcours B</Signal> : agentFini ? <Signal kind="succes">Terminé</Signal> : <Signal kind="info">En cours</Signal>}
        </span>
        {agentFini || !contrat ? (
          <Illus key="etoile" name="etoile" width={110} className="anim-pop absolute top-12 left-[calc(50%-55px)]" />
        ) : (
          <Illus key="nav" name="navigateur" width={126} className="anim-float absolute top-12 left-1/2 -translate-x-1/2" />
        )}
        <p key={`${Boolean(contrat)}-${agentFini}-msg`} className="anim-in absolute inset-x-[22px] bottom-5 rounded-[22px] bg-white px-3.5 py-3 text-center text-sm leading-5" aria-live="polite">
          {!contrat ? (
            <>Sans contrat, le diagnostic s&apos;appuie sur <b>la loi puis les recommandations</b>.</>
          ) : agentFini && contrat.inoccupation ? (
            <>J&apos;ai trouvé les conditions générales <b>{contrat.assureur} {contrat.reference_cg}</b>. Inoccupation limitée à <b>{contrat.inoccupation.duree_max_jours} jours, p. {contrat.inoccupation.page}</b>.</>
          ) : (
            <>Je cherche les conditions générales <b>{contrat.assureur} {contrat.reference_cg}</b> sur le site de l&apos;assureur…</>
          )}
        </p>
      </section>

      <p className="flex justify-between text-[13px] text-ink-muted">
        <span>{contrat ? "Lecture seule, sans connexion" : "Contrat ajoutable plus tard"}</span>
        <span className="font-semibold">H Company</span>
      </p>

      <SectionTitle aside={<span key={finies} className="anim-bump inline-block">{finies} sur {pieces.length}</span>}>Avancement par pièce</SectionTitle>
      {enCours && <p key={message} className="anim-in -mt-1.5 text-[13px] text-ink-muted" aria-live="polite">{PENDANT[message]}</p>}
      {pieces.length === 0 ? (
        <p className="rounded-[20px] bg-white px-4 py-3.5 text-sm text-ink-muted">Aucune pièce filmée pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {pieces.map(({ p, e }) => (
            <li key={p.id} className="grid grid-cols-[104px_1fr] items-center gap-2.5">
              <span className={cx("text-sm font-bold transition-colors duration-300", e.etat === "en_attente" && "text-ink-muted")}>{p.nom}</span>
              <span className={cx("relative h-[30px] overflow-hidden rounded-full", e.etat === "en_attente" ? "anim-shimmer" : "bg-[#EEF0F6]")} role="progressbar" aria-valuenow={e.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.nom} : ${e.libelle}`}>
                {e.etat === "terminee" ? (
                  <span className="anim-in absolute inset-0 flex items-center justify-end gap-1.5 rounded-full bg-nuit pr-2 text-xs font-bold text-white">
                    {e.libelle} <span className="anim-pop"><CircleCheck size={20} /></span>
                  </span>
                ) : e.etat === "en_cours" ? (
                  <>
                    <span className="stripes anim-stripes absolute inset-y-0 left-0 rounded-full transition-[width] duration-200" style={{ width: `${Math.max(e.pct, 12)}%` }} />
                    <span className="absolute inset-y-0 right-3 flex items-center text-xs font-bold whitespace-nowrap">{e.libelle}</span>
                  </>
                ) : e.etat === "echec" ? (
                  <span className="absolute inset-0 flex items-center rounded-full bg-danger-bg pl-3 text-xs font-bold text-danger-text">{e.libelle}</span>
                ) : (
                  <span className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-ink-muted">{e.libelle}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {fini && (
        <div role="status" className="anim-in flex items-center gap-3 rounded-[22px] bg-succes-bg px-4 py-3.5 text-succes-text">
          <span className="anim-pop"><CircleCheck size={26} /></span>
          <span className="flex flex-col">
            <b className="text-[15px]">Diagnostic prêt</b>
            <span className="text-[13px]">{points === 0 ? "Aucun point à traiter n'a été repéré." : `${points} point${points > 1 ? "s" : ""} repéré${points > 1 ? "s" : ""} pour ${logement.occupant.libelle}, classé${points > 1 ? "s" : ""} par priorité.`}</span>
          </span>
        </div>
      )}

      <div className="mt-auto">
        <Pill href={`${base}/plan`} disabled={logement.exemple && finies < 1} className={cx(fini && "anim-bump")}>
          {fini ? <>Voir le diagnostic <Icon name="arrow" size={18} /></> : "Voir les premières pièces"}
        </Pill>
      </div>
      {toast.node}
    </Screen>
  );
}
