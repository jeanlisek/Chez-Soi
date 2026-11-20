"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Cursor } from "@/components/cs/icons";
import { ActionBar, BackButton, Chip, ExempleTag, Header, Pill, RoundButton, Screen, Signal, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";

import { declarerDetecteur } from "../actions-serveur";
import { libelleSource } from "@/lib/domaine";
import { sansDimension } from "@/lib/schemas";

type Onglet = "priorite" | "contrat" | "plus_tard";

/** Couleur de carte par rang, comme sur la maquette : lilas, pervenche, puis blanc. */
const CARTE = [
  { bg: "bg-lilas", sub: "text-lilas-ink" },
  { bg: "bg-pervenche", sub: "text-ink-soft" },
  { bg: "bg-white", sub: "text-ink-muted" },
];

/**
 * Écran 8 · Plan d'action. Ordre du verdict : contrat (clause et page), puis loi, puis recommandé.
 * Le verdict vient des règles ; le texte explicatif du LLM ne le change jamais.
 * Pour chaque action : « L'agent prépare » (arrêt avant le panier) ou « Je m'en occupe ».
 */
export default function PageActions() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [onglet, setOnglet] = useState<Onglet>("priorite");
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [artisan, setArtisan] = useState<string | null>(null);
  const [reponse, setReponse] = useState(false);

  // Détecteur non repéré sur la vidéo : l'utilisateur dit s'il en a un ; le plan est recalculé.
  const repondreDetecteur = async (present: boolean) => {
    if (logement.exemple) {
      setMessage("Sur votre propre logement, votre réponse met le plan à jour.");
      return;
    }
    setReponse(true);
    const r = await declarerDetecteur(logement.id, present).catch(() => null);
    setReponse(false);
    if (!r?.ok) {
      setMessage(r?.message ?? "Réponse non enregistrée. Réessayez dans un instant.");
      return;
    }
    setMessage(present ? "C'est noté : pensez à le tester une fois par mois avec son bouton." : "C'est noté : le détecteur reste dans votre plan.");
    router.refresh();
  };

  const actions = [...logement.actions].sort((a, b) => a.priorite - b.priorite);
  const visibles = actions.filter((a) =>
    onglet === "contrat" ? a.source.force === "contrat" : onglet === "priorite" ? a.groupe === "priorite" : a.groupe === "plus_tard",
  );
  // L'agent lit la cote avec get_mesures : sur un vrai logement, un objet ne peut lui être confié
  // qu'une fois la cote de son point confirmée, sauf s'il n'a aucune dimension à respecter
  // (veilleuse, détecteur). Les missions de tous les onglets comptent.
  const faillePour = (a: (typeof actions)[number]) => logement.failles.find((f) => f.id === a.faille_id);
  const lancable = (a: (typeof actions)[number]) => {
    if (a.usage === null) return false;
    if (logement.exemple || a.usage !== 2) return true;
    const f = faillePour(a);
    return f?.cote?.statut === "confirmee" || sansDimension(f?.element);
  };
  const missions = actions.filter((a) => lancable(a) && etat.missions[a.id] === "agent");
  const compte = (o: Onglet) =>
    o === "contrat" ? actions.filter((a) => a.source.force === "contrat").length : actions.filter((a) => a.groupe === o).length;

  const lancer = async () => {
    let sessionId: string | null = null;
    if (!logement.exemple) {
      // Une session par action : la route lance la première de la liste (objets d'abord).
      const pretes = missions.filter((a) => a.usage === 2);
      if (pretes.length === 0) {
        setMessage("Confirmez d'abord les dimensions sur l'écran du point concerné : l'agent en a besoin pour choisir le produit.");
        return;
      }
      setEnvoi(true);
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logement_id: logement.id, usage: 2, action_ids: pretes.map((a) => a.id) }),
      }).catch(() => null);
      const corps = r ? ((await r.json().catch(() => null)) as { session_id?: string; message?: string } | null) : null;
      setEnvoi(false);
      if (!r || !r.ok || !corps?.session_id) {
        setMessage(corps?.message ?? "L'agent n'a pas pu démarrer. Réessayez dans un instant.");
        return;
      }
      sessionId = corps.session_id;
    }
    maj({ run: "en_cours", decision: null, sessionId });
    router.push(`${base}/agent`);
  };

  // Usage 4 : des artisans près de la commune pour des travaux que l'agent ne peut pas acheter.
  // Lecture seule : l'agent ne contacte personne. Une session tout de suite, suivie sur son écran.
  const trouverArtisan = async (actionId: string) => {
    if (logement.exemple) {
      setMessage("Sur votre propre logement, l'agent cherche des artisans près de chez vous pour ces travaux.");
      return;
    }
    setMessage(null);
    setArtisan(actionId);
    const r = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logement_id: logement.id, usage: 4, action_ids: [actionId] }),
    }).catch(() => null);
    const corps = r ? ((await r.json().catch(() => null)) as { session_id?: string; message?: string } | null) : null;
    setArtisan(null);
    if (!r?.ok || !corps?.session_id) {
      setMessage(corps?.message ?? "La recherche d'artisans n'a pas pu démarrer. Réessayez dans un instant.");
      return;
    }
    router.push(`${base}/artisans?session=${encodeURIComponent(corps.session_id)}`);
  };

  return (
    <Screen nav="plan" className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title="Plan d'action" right={<RoundButton icon="filter" label="Filtrer" />} />
      {logement.exemple && <ExempleTag />}

      <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
        <Chip active={onglet === "priorite"} onClick={() => setOnglet("priorite")}>Priorités · {compte("priorite")}</Chip>
        <Chip active={onglet === "contrat"} onClick={() => setOnglet("contrat")}>Contrat{etat.parcours === "A" ? ` · ${compte("contrat")}` : ""}</Chip>
        <Chip active={onglet === "plus_tard"} onClick={() => setOnglet("plus_tard")}>Plus tard · {compte("plus_tard")}</Chip>
      </div>

      {actions.length === 0 ? (
        <p className="rounded-[26px] bg-white px-4 py-3.5 text-sm leading-5 text-ink-muted">Le plan d&apos;action apparaît dès que l&apos;analyse de vos pièces est terminée.</p>
      ) : onglet === "contrat" && etat.parcours === "B" ? (
        <p className="rounded-[26px] bg-white px-4 py-3.5 text-sm leading-5 text-ink-muted">Parcours sans contrat : le plan s&apos;appuie sur la loi puis sur les recommandations.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((a, i) => {
            const ag = lancable(a) && etat.missions[a.id] === "agent";
            const f = faillePour(a);
            const c = CARTE[Math.min(i, 2)];
            const rang = onglet === "priorite" ? i + 1 : a.priorite;
            return (
              <li key={a.id} className={cx("flex flex-col gap-2.5 rounded-[28px] px-4 py-3.5", c.bg)}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-sm font-extrabold">{rang}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="text-[15px] leading-5">{a.titre}</b>
                    <span className={cx("text-xs", c.sub)}>{libelleSource(a.source)}</span>
                  </span>
                  <Signal kind={a.niveau} />
                </div>
                {f?.element === "detecteur_fumee" && (
                  <div className="flex flex-col gap-2">
                    <p className={cx("text-xs leading-[17px]", c.sub)}>
                      {f.non_repere
                        ? "Aucun détecteur repéré sur votre vidéo. Il en faut au moins un : un détecteur autonome marqué NF EN 14604 et CE, fixé au plafond. Vous en avez déjà un ?"
                        : "Appuyez sur son bouton test et vérifiez au dos la norme NF EN 14604 et le marquage CE ; sinon, remplacez-le par un modèle conforme."}
                    </p>
                    {f.non_repere && (
                      <div className="grid grid-cols-2 gap-1 rounded-full bg-white/60 p-1">
                        <button type="button" onClick={() => void repondreDetecteur(true)} disabled={reponse} className="h-[38px] rounded-full bg-white text-[13px] font-bold disabled:opacity-50">
                          Oui, j&apos;en ai un
                        </button>
                        <button type="button" onClick={() => void repondreDetecteur(false)} disabled={reponse} className="h-[38px] rounded-full text-[13px] font-bold disabled:opacity-50">
                          Non
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {a.usage === null && f?.element === "detecteur_fumee" ? null : a.usage === null ? (
                  <div className="flex flex-col gap-2">
                    <p className={cx("text-xs leading-[17px]", c.sub)}>Travaux à confier à un artisan : l&apos;agent cherche qui peut les faire près de chez vous, sans contacter personne.</p>
                    {a.faille_id && (
                      <button
                        type="button"
                        onClick={() => void trouverArtisan(a.id)}
                        disabled={artisan !== null}
                        className="h-[38px] rounded-full bg-white/80 text-[13px] font-bold text-nuit disabled:opacity-50"
                      >
                        {artisan === a.id ? "Lancement…" : "Trouver un artisan"}
                      </button>
                    )}
                  </div>
                ) : !lancable(a) ? (
                  <p className={cx("text-xs leading-[17px]", c.sub)}>
                    {f?.cote ? (
                      <>
                        L&apos;agent choisit le produit d&apos;après la cote :{" "}
                        <a href={`${base}/faille/${f.id}`} className="font-bold text-nuit underline">confirmez-la sur l&apos;écran du point</a> pour le lui confier.
                      </>
                    ) : (
                      "Les dimensions de ce point n'ont pas pu être mesurées sur la vidéo : refilmez la pièce pour confier l'achat à l'agent."
                    )}
                  </p>
                ) : (
                <div className="grid grid-cols-2 gap-1 rounded-full bg-white/60 p-1" role="radiogroup" aria-label={`Qui s'occupe de : ${a.titre}`}>
                  <button type="button" role="radio" aria-checked={ag} onClick={() => maj({ missions: { ...etat.missions, [a.id]: "agent" } })} className={cx("h-[38px] rounded-full text-[13px] font-bold", ag ? "bg-nuit text-white" : "")}>
                    L&apos;agent prépare
                  </button>
                  <button type="button" role="radio" aria-checked={!ag} onClick={() => maj({ missions: { ...etat.missions, [a.id]: "moi" } })} className={cx("h-[38px] rounded-full text-[13px] font-bold", !ag ? "bg-white" : "")}>
                    Je m&apos;en occupe
                  </button>
                </div>
                )}
                {ag && (
                  <p className={cx("flex items-start gap-2 text-xs leading-[17px]", c.sub)}>
                    <Cursor size={13} className="mt-0.5 text-nuit" />
                    <span>
                      {a.mission} <b className="text-nuit">{a.usage === 3 ? "Arrêt avant l'envoi : vous validez." : "Arrêt avant le panier : vous validez."}</b>
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionBar withNav>
        {message && <p className="rounded-[20px] bg-attention-bg px-4 py-3 text-sm font-semibold text-attention-text">{message}</p>}
        <Pill onClick={lancer} disabled={missions.length === 0 || envoi}>
          {missions.length === 0 ? "Aucune mission pour l'agent" : envoi ? "Lancement…" : `Lancer l'agent · ${missions.length} mission${missions.length > 1 ? "s" : ""}`}
        </Pill>
      </ActionBar>
    </Screen>
  );
}
