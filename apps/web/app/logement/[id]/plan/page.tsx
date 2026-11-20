"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Chip, ExempleTag, Illus, Logo, Pill, RoundButton, Ring, Screen, Signal, SignalShape, cx, useValidationEnAttente } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { LIBELLE_NIVEAU, type Faille, type Niveau, type Piece, type Risque } from "@/lib/domaine";

const ORDRE: Niveau[] = ["critique", "eleve", "modere", "surveiller"];

const BADGE: Record<Niveau | "ok", string> = {
  critique: "bg-danger-solid text-white border-danger-solid",
  eleve: "bg-danger-bg text-danger-text border-danger-border",
  modere: "bg-white text-danger-text border-danger-border",
  surveiller: "bg-veille-bg text-veille-text border-veille-border border-dashed",
  ok: "bg-succes-solid text-white border-succes-solid",
};

/** Plan du T2 de la maquette (zone 350 × 196), retrouvé par le nom de la pièce. */
const PLAN_T2: Record<string, { l: number; t: number; w: number; h: number }> = {
  Chambre: { l: 0, t: 0, w: 110, h: 100 },
  Salon: { l: 118, t: 0, w: 130, h: 100 },
  Cuisine: { l: 256, t: 0, w: 94, h: 100 },
  Couloir: { l: 0, t: 108, w: 350, h: 40 },
  "Salle de bain": { l: 0, t: 154, w: 110, h: 42 },
  Entrée: { l: 256, t: 154, w: 94, h: 42 },
};

/** Positions des pièces : le plan de la maquette si les noms s'y prêtent, sinon une grille de 3 colonnes. */
function disposer(pieces: Piece[]) {
  // Le plan du T2 n'a de sens que s'il est presque complet : sinon il laisse des trous (pièces non filmées).
  if (pieces.length >= 5 && pieces.every((p) => PLAN_T2[p.nom]))
    return { hauteur: 196, cases: pieces.map((p) => ({ p, ...PLAN_T2[p.nom] })), vide: true };
  const colonnes = pieces.length <= 4 ? 2 : 3;
  const largeur = colonnes === 2 ? 171 : 110;
  const cases = pieces.map((p, i) => ({ p, l: (i % colonnes) * (largeur + 8), t: Math.floor(i / colonnes) * 70, w: largeur, h: 62 }));
  return { hauteur: Math.max(1, Math.ceil(pieces.length / colonnes)) * 70 - 8, cases, vide: false };
}

/** Écran 6 · Accueil et plan du logement : points à traiter, filtres chute / intrusion, failles par pièce. */
export default function PagePlan() {
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;
  const enAttente = useValidationEnAttente();
  const [filtre, setFiltre] = useState<Risque | "toutes">("toutes");
  const [sel, setSel] = useState(logement.exemple ? "couloir" : (logement.failles[0]?.piece_id ?? logement.pieces[0]?.id ?? ""));

  const toutes = logement.failles;
  const compte = (n: Niveau) => toutes.filter((f) => f.niveau === n).length;
  const reglees = toutes.filter((f) => f.statut === "regle").length + (etat.decision === "approuve" ? 1 : 0);
  const resume = [
    compte("critique") && `${compte("critique")} critique`,
    compte("eleve") && `${compte("eleve")} élevé${compte("eleve") > 1 ? "s" : ""}`,
    compte("modere") && `${compte("modere")} modéré${compte("modere") > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");
  const piece = logement.pieces.find((p) => p.id === sel);
  const failles = useMemo(
    () => toutes.filter((f) => f.piece_id === sel && (filtre === "toutes" || f.risque === filtre)),
    [toutes, sel, filtre],
  );
  const plan = disposer(logement.pieces);
  const horsPiece = toutes.filter((f) => !logement.pieces.some((p) => p.id === f.piece_id) && (filtre === "toutes" || f.risque === filtre));
  const prenom = logement.occupant.libelle;

  // Maquette : tant qu'aucune pièce n'est analysée et qu'aucun point n'existe, l'accueil invite à filmer.
  const sansDiagnostic = !logement.exemple && toutes.length === 0 && !logement.pieces.some((p) => p.analyse === "terminee");

  return (
    <Screen nav="accueil" className="gap-3">
      <div className="flex items-center gap-3">
        <Logo size={52} />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-[17px]">Bonjour {logement.aidant}</b>
          <Link href={`${base}/compte`} className="truncate text-[13px] text-ink-muted underline underline-offset-2" aria-label={`Logement de ${prenom}, voir le profil`}>
            Logement de {prenom}{logement.type ? ` · ${logement.type}` : ""}
          </Link>
        </span>
        <RoundButton icon="chart" label="Suivi du logement" href={`${base}/suivi`} />
        <span className="relative">
          <RoundButton icon="bell" label={enAttente ? "Notifications, 1 validation en attente" : "Notifications"} href={enAttente ? `${base}/agent/validation` : undefined} />
          {enAttente && <span className="absolute top-[9px] right-[11px] h-[9px] w-[9px] rounded-full border-2 border-white bg-attention-solid" />}
        </span>
      </div>
      {logement.exemple && <ExempleTag />}
      {!logement.exemple && (logement.occupants ?? [logement.occupant]).every((o) => !o.consentement_art9_le) && (
        <Link href={`${base}/compte`} className="rounded-[20px] bg-veille-bg px-4 py-3 text-[13px] leading-[18px] font-semibold text-veille-text">
          Accord retiré : plan général, non adapté aux habitants. Redonner l&apos;accord dans le Profil.
        </Link>
      )}

      {sansDiagnostic ? (
        <div className="anim-in flex flex-1 flex-col gap-3.5">
          <section className="relative flex min-h-[220px] flex-col justify-end gap-1.5 overflow-hidden rounded-card bg-pervenche px-5 pt-[110px] pb-5">
            <Illus name="appareil" width={110} className="absolute top-5 left-1/2 -translate-x-1/2" />
            <h1 className="text-[23px] leading-7 font-extrabold">Pas encore de diagnostic</h1>
            <p className="text-sm leading-[19px] text-ink-soft">
              {logement.pieces.length ? "Vos vidéos sont en cours d'analyse. Le diagnostic arrive dès la première pièce terminée." : "Il faut d'abord filmer le logement. Une vidéo par pièce, 30 secondes."}
            </p>
          </section>
          <Pill href={logement.pieces.length ? `${base}/analyse` : `${base}/capture`}>{logement.pieces.length ? "Suivre l'analyse" : "Filmer ce logement"}</Pill>
          <Pill href={`${base}/compte`} variant="contour">Voir le profil</Pill>
        </div>
      ) : (<>
      <section className="relative h-[170px] flex-none overflow-hidden rounded-card bg-pervenche px-5 py-[18px]">
        <span className="absolute top-4 right-4"><Ring value={reglees} total={Math.max(toutes.length, 1)} /></span>
        <h1 className="text-[23px] leading-7 font-extrabold">
          {toutes.length - reglees} point{toutes.length - reglees > 1 ? "s" : ""} à traiter
        </h1>
        <p className="text-sm text-ink-soft">{resume || (toutes.length ? "Repérés sur vos vidéos" : logement.pieces.length ? "Analyse en cours" : "Filmez une pièce pour commencer")}</p>
        <Link href={toutes.length ? `${base}/actions` : `${base}/capture`} className="absolute bottom-[18px] left-5 flex h-[46px] items-center rounded-full bg-nuit px-5 text-sm font-bold text-white">
          {toutes.length ? "VOIR LE PLAN" : "FILMER UNE PIÈCE"}
        </Link>
        <Illus name="repere" width={72} className="absolute right-5 -bottom-3" />
      </section>

      <div className="flex gap-2">
        <Chip active={filtre === "toutes"} onClick={() => setFiltre("toutes")}>Toutes</Chip>
        <Chip active={filtre === "chute"} onClick={() => setFiltre("chute")}>Chute · {toutes.filter((f) => f.risque === "chute").length}</Chip>
        <Chip active={filtre === "intrusion"} onClick={() => setFiltre("intrusion")}>Intrusion · {toutes.filter((f) => f.risque === "intrusion").length}</Chip>
        {toutes.some((f) => f.risque === "incendie") && (
          <Chip active={filtre === "incendie"} onClick={() => setFiltre("incendie")}>Incendie · {toutes.filter((f) => f.risque === "incendie").length}</Chip>
        )}
      </div>

      {/* Points sans pièce (détecteur de fumée non repéré) : sinon invisibles sur le plan. */}
      {horsPiece.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Tout le logement</h2>
            <span className="text-[13px] font-bold text-cobalt">{horsPiece.length} point{horsPiece.length > 1 ? "s" : ""}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {horsPiece.map((f) => (
              <FailleRow key={f.id} f={f} href={`${base}/faille/${f.id}`} />
            ))}
          </ul>
        </>
      )}

      {logement.pieces.length > 0 && (
        <div className="relative mx-auto w-[350px] flex-none" style={{ height: plan.hauteur }} aria-label="Plan du logement, touchez une pièce">
          {plan.vide && <div className="absolute top-[154px] left-[118px] h-[42px] w-[130px] rounded-2xl bg-[#EEF0F6]" />}
          {plan.cases.map(({ p, l, t, w, h }) => {
            const fp = toutes.filter((f) => f.piece_id === p.id && (filtre === "toutes" || f.risque === filtre));
            const on = p.id === sel;
            const pire = ORDRE.find((n) => fp.some((f) => f.niveau === n));
            const ligne = h < 50;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(p.id)}
                aria-pressed={on}
                aria-label={`${p.nom}, ${fp.length ? `${fp.length} point(s)` : "rien à signaler"}`}
                className={cx(
                  "absolute flex rounded-[18px] border-2 px-2.5 py-2 text-left",
                  ligne ? "flex-row items-center justify-between" : "flex-col items-start justify-between",
                  on ? "border-nuit bg-pervenche" : "border-white bg-white",
                )}
                style={{ left: l, top: t, width: w, height: h }}
              >
                <span className="text-[13px] font-bold">{p.nom}</span>
                <span className={cx("flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] px-1.5 text-xs font-bold", BADGE[pire ?? "ok"])}>
                  {fp.length || "✓"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {piece && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">{piece.nom}</h2>
            <span className="text-[13px] font-bold text-cobalt">{failles.length} point{failles.length > 1 ? "s" : ""}</span>
          </div>
          {failles.length === 0 ? (
            <p className="rounded-[20px] bg-succes-bg px-4 py-3.5 text-sm font-semibold text-succes-text">
              {piece.analyse === "terminee" ? `Rien à signaler pour ${prenom} ici.` : "Analyse de la pièce en cours."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {failles.map((f) => (
                <FailleRow key={f.id} f={f} href={`${base}/faille/${f.id}`} />
              ))}
            </ul>
          )}
        </>
      )}
      </>)}
    </Screen>
  );
}

function FailleRow({ f, href }: { f: Faille; href: string }) {
  const detail = f.cote
    ? `${f.cote.largeur_cm} × ${f.cote.longueur_cm} cm ${f.cote.statut === "a_confirmer" ? "à confirmer" : "confirmé"}`
    : f.source.force === "contrat"
      ? `exigé par le contrat p. ${f.source.page}`
      : f.source.force === "loi"
        ? f.non_repere ? "Obligation légale · non repéré" : "Loi"
        : f.source.reference.startsWith("Repéré")
          ? "Aucune action"
          : "Recommandé";
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-[22px] bg-white px-3 py-2.5">
        <span className={cx("flex h-10 w-10 flex-none items-center justify-center rounded-full", f.niveau === "surveiller" ? "bg-veille-bg" : "bg-danger-bg")}>
          <SignalShape kind={f.niveau === "critique" ? "eleve" : f.niveau} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-sm">{f.titre}</b>
          <span className="text-xs text-ink-muted">{f.risque === "chute" ? "Chute" : f.risque === "intrusion" ? "Intrusion" : f.risque === "incendie" ? "Incendie" : "Autre"} · {detail}</span>
        </span>
        <Signal kind={f.niveau}>{LIBELLE_NIVEAU[f.niveau]}</Signal>
      </Link>
    </li>
  );
}
