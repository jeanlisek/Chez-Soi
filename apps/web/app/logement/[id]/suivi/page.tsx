"use client";

import Link from "next/link";

import { Cursor, Icon } from "@/components/cs/icons";
import { ExempleTag, Illus, RoundButton, Screen, cx, useToast } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import type { Faille } from "@/lib/domaine";

const COULEUR_SEGMENT: Record<Faille["statut"], string> = {
  regle: "bg-succes-solid",
  en_traitement: "bg-attention-solid",
  a_traiter: "bg-danger-bg shadow-[inset_0_0_0_1.5px_#C93A48]",
  a_surveiller: "bg-veille-bg shadow-[inset_0_0_0_1.5px_#7189B5]",
};
const ORDRE: Faille["statut"][] = ["regle", "en_traitement", "a_traiter", "a_surveiller"];

/** Écran 12 · Suivi : du rouge au vert, avancement par pièce et prochaines démarches. */
export default function PageSuivi() {
  const { logement, etat, reinitialiser } = useParcours();
  const base = `/logement/${logement.id}`;
  const prenom = logement.occupant.libelle;

  // Une faille confiée à l'agent passe « en traitement » ; « réglée » une fois la proposition approuvée.
  const statut = (f: Faille): Faille["statut"] => {
    if (f.statut === "regle") return "regle";
    const action = logement.actions.find((a) => a.faille_id === f.id);
    if (action && etat.missions[action.id] === "agent" && etat.run !== "aucun" && etat.decision !== "refuse")
      return etat.decision === "approuve" ? "regle" : "en_traitement";
    if (f.statut === "a_surveiller" || f.niveau === "surveiller") return "a_surveiller";
    return "a_traiter";
  };
  const statuts = logement.failles.map(statut);
  const n = (s: Faille["statut"]) => statuts.filter((x) => x === s).length;
  const segments = [...statuts].sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b));

  // Les points sans pièce (détecteur de fumée non repéré) comptent dans une ligne « Tout le logement ».
  const groupes = [
    ...logement.pieces.map((p) => ({ id: p.id, nom: p.nom, failles: logement.failles.filter((f) => f.piece_id === p.id) })),
    ...(() => {
      const hors = logement.failles.filter((f) => !logement.pieces.some((p) => p.id === f.piece_id));
      return hors.length ? [{ id: "logement", nom: "Tout le logement", failles: hors }] : [];
    })(),
  ];
  const pieces = groupes.map((p) => {
    const fs = p.failles.map(statut);
    const nb = (s: Faille["statut"]) => fs.filter((x) => x === s).length;
    if (fs.length === 0) return [p.id, p.nom, "rien à faire", "bg-succes-bg text-succes-text"] as const;
    if (nb("a_traiter")) return [p.id, p.nom, `${nb("a_traiter")} à traiter`, "bg-danger-bg text-danger-text"] as const;
    if (nb("en_traitement")) return [p.id, p.nom, `${nb("en_traitement")} en traitement`, "bg-attention-bg text-attention-text"] as const;
    if (fs.every((s) => s === "regle")) return [p.id, p.nom, "réglé", "bg-succes-bg text-succes-text"] as const;
    return [p.id, p.nom, "à surveiller", "bg-veille-bg text-veille-text"] as const;
  });

  // Partage du plan, sans adresse ni donnée de santé : l'avancement et les points à traiter.
  const toast = useToast();
  const partager = async () => {
    const lignes = logement.failles.filter((f) => statut(f) !== "regle").map((f) => {
      const piece = logement.pieces.find((p) => p.id === f.piece_id)?.nom;
      return `- ${f.titre}${piece ? ` (${piece})` : ""}`;
    });
    const texte = [`Chez Soi · Logement de ${prenom}`, `${n("regle")} sur ${statuts.length} réglé, ${n("en_traitement")} en traitement par l'agent.`, ...(lignes.length ? ["À traiter :", ...lignes.slice(0, 12)] : [])].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: `Chez Soi · Logement de ${prenom}`, text: texte });
      else {
        await navigator.clipboard.writeText(texte);
        toast.show("Plan copié, à coller dans un message");
      }
    } catch {
      // Partage annulé par l'utilisateur.
    }
  };

  return (
    <Screen nav="accueil" className="gap-3">
      <div className="flex items-center gap-3">
        <RoundButton icon="back" label="Retour à l'accueil" href={`${base}/plan`} />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[17px]">Suivi</b>
          <span className="truncate text-[13px] text-ink-muted">Logement de {prenom}</span>
        </span>
        <RoundButton icon="share" label="Partager le plan avec un proche" onClick={() => void partager()} />
      </div>
      {logement.exemple && <ExempleTag />}

      <section className="relative h-[196px] flex-none overflow-hidden rounded-card bg-pervenche px-5 py-[18px]">
        <div className="flex max-w-[200px] flex-col gap-1">
          <h1 className="text-[23px] leading-7 font-extrabold">{n("regle")} sur {statuts.length} réglé{n("regle") > 1 ? "s" : ""}</h1>
          <p className="text-sm text-ink-soft">{n("en_traitement")} en traitement par l&apos;agent</p>
        </div>
        <Illus name="yoga" width={74} className="absolute top-3.5 right-[22px]" />
        <div className="absolute inset-x-5 bottom-[18px] flex flex-col gap-2">
          <div className="flex gap-1" role="img" aria-label={`${n("regle")} réglé, ${n("en_traitement")} en traitement, ${n("a_traiter")} à traiter, ${n("a_surveiller")} à surveiller`}>
            {segments.length === 0 ? <span className="h-3 flex-1 rounded-full bg-white/60" /> : segments.map((s, i) => <span key={i} className={cx("h-3 flex-1 rounded-full", COULEUR_SEGMENT[s])} />)}
          </div>
          <p className="flex gap-2.5 text-[11px] font-semibold"><span>Réglé</span>·<span>En traitement</span>·<span>À traiter</span>·<span>À surveiller</span></p>
        </div>
      </section>

      {pieces.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {pieces.map(([id, nom, s, c]) => (
            <li key={id} className={cx("flex flex-col gap-0.5 rounded-[20px] px-3 py-2.5 text-xs", c)}>
              <b className="text-sm text-nuit">{nom}</b>
              {s}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-[17px] font-bold">À venir</h2>
      <Link href={`${base}/absence`} className="flex items-center gap-3 rounded-[30px] bg-nuit p-2 text-white">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-white text-nuit"><Icon name="cal" /></span>
        <span className="flex flex-1 flex-col">
          <b className="text-[15px]">Absence de {prenom}</b>
          <span className="text-xs text-[#C9D6EE]">{etat.parcours === "A" ? "Assureur et OTV à relire" : "OTV à relire"}</span>
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-attention-solid text-attention-on"><Icon name="arrow" size={18} /></span>
      </Link>
      <div className="flex items-center gap-3 rounded-[30px] bg-white p-2">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-pervenche-soft text-cobalt"><Cursor /></span>
        <span className="flex flex-1 flex-col">
          <b className="text-[15px]">Veille des prix</b>
          <span className="text-xs text-ink-muted">Bientôt disponible</span>
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-nuit text-white"><Icon name="arrow" size={18} /></span>
      </div>

      {logement.exemple && (
        <button type="button" onClick={reinitialiser} className="mt-1 flex h-10 items-center justify-center gap-2 text-sm font-bold text-ink-muted">
          <Icon name="refresh" size={16} />
          Recommencer la démo
        </button>
      )}
      {toast.node}
    </Screen>
  );
}
