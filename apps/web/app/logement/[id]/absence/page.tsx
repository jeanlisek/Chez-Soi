"use client";

import { useEffect, useState } from "react";

import { Icon, Triangle, type IconName } from "@/components/cs/icons";
import { ActionBar, BackButton, ExempleTag, Header, Illus, Note, Pill, RoundButton, Screen, SectionTitle, Signal, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { lireResume, runTermine, useRunAgent } from "@/lib/agent/client";
import type { SortieUsage3 } from "@/lib/schemas";
import { formaterDate } from "@/lib/domaine";
import { clientNavigateur } from "@/lib/supabase/client";

function ajouterJours(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Écran 11 · Mode absence (usage 3 : préparer sans jamais envoyer). Compare la durée au seuil
 * d'inoccupation du contrat (parcours A), propose à tous l'information de l'assureur, et calcule la fenêtre de l'Opération tranquillité vacances :
 * au plus tôt 45 jours avant le départ, au plus tard 3 jours avant (police) ou la veille (gendarmerie),
 * d'après service-public.gouv.fr (F34634). Aucun identifiant chez l'agent : l'utilisateur envoie lui-même.
 */
export default function PageAbsence() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [pret, setPret] = useState(false);
  // Vrai logement : l'agent H prépare les démarches (usage 3). Session suivie comme sur l'écran Agent.
  const reel = !logement.exemple;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lancement, setLancement] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);
  const [repondu, setRepondu] = useState(false);
  // Au retour sur l'écran, on retrouve le dernier dossier préparé (lecture sous RLS) au lieu de repartir de zéro.
  useEffect(() => {
    if (!reel) return;
    let actif = true;
    void clientNavigateur()
      ?.from("runs_agent")
      .select("session_id")
      .eq("logement_id", logement.id)
      .eq("usage", 3)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (actif && data?.session_id) setSessionId((actuel) => actuel ?? data.session_id);
      });
    return () => {
      actif = false;
    };
  }, [reel, logement.id]);
  const suivi = useRunAgent(reel ? sessionId : null);
  const termine = runTermine(suivi.etat);
  const demande = suivi.etat?.validation_en_attente ?? null;
  const dossier = (suivi.etat?.run.sortie_finale ?? null) as Partial<SortieUsage3> | null;
  const absence = logement.absence ?? { depart_le: "2026-12-15", retour_le: "2027-01-19", motif: "" };
  const jours = etat.absenceJours || 35;
  const depart = absence.depart_le;
  const retour = ajouterJours(depart, jours);
  const contrat = etat.parcours === "A" ? logement.contrat : null;
  const seuil = contrat?.inoccupation?.duree_max_jours;
  const depasse = seuil != null && jours > seuil;
  const zone = logement.zone_otv;
  const otvDebut = ajouterJours(depart, -45);
  const otvFin = ajouterJours(depart, zone === "police" ? -3 : -1);
  const prenom = logement.occupant.libelle;
  // Les clauses extraites finissent chacune par un point : on les enchaîne proprement dans une seule phrase.
  const protections = (contrat?.inoccupation?.protections ?? []).map((x) => x.trim().replace(/[.;]+$/, "").toLowerCase()).join(" ; ");

  // L'information de l'assureur est proposée à tous (décision du 18/11) : obligation du contrat si
  // une clause d'inoccupation est dépassée (avec sa page), sinon simple recommandation.
  const assureur = contrat?.assureur ? `Prévenir ${contrat.assureur}` : "Prévenir votre assureur";
  const detailAssureur = contrat && depasse
    ? `Exigé par le contrat au-delà de ${seuil} jours, avant le départ (p. ${contrat.inoccupation!.page})`
    : contrat && seuil != null
      ? `Sous le seuil de ${seuil} jours du contrat : facultatif`
      : "Recommandé pour une absence longue";

  const demarches: { icon: IconName; titre: string; detail: string; tone: string; sub: string }[] = [
    { icon: "shield", titre: assureur, detail: detailAssureur, tone: depasse ? "bg-nuit text-white" : "bg-white", sub: depasse ? "text-[#C9D6EE]" : "text-ink-muted" },
    { icon: "police", titre: "Tranquillité vacances", detail: `À demander entre le ${formaterDate(otvDebut)} et le ${formaterDate(otvFin)} (${zone === "police" ? "police" : "gendarmerie"})`, tone: "bg-pervenche", sub: "text-ink-soft" },
    { icon: "mail", titre: "Garde du courrier", detail: "En option, pour une boîte qui ne déborde pas", tone: "bg-white", sub: "text-ink-muted" },
  ];

  const lancer = async () => {
    setLancement(true);
    setAlerte(null);
    setRepondu(false);
    const json = { method: "POST", headers: { "Content-Type": "application/json" } };
    // Les dates d'abord (l'agent les relit dans `absences`), puis la session H.
    const a = await fetch("/api/absence", { ...json, body: JSON.stringify({ logement_id: logement.id, depart_le: depart, retour_le: retour }) }).catch(() => null);
    if (!a?.ok) {
      setLancement(false);
      setAlerte("Les dates n'ont pas pu être enregistrées.");
      return;
    }
    const r = await fetch("/api/agent/run", { ...json, body: JSON.stringify({ logement_id: logement.id, usage: 3 }) }).catch(() => null);
    const corps = r ? ((await r.json().catch(() => null)) as { session_id?: string; message?: string } | null) : null;
    setLancement(false);
    if (!r?.ok || !corps?.session_id) {
      setAlerte(corps?.message ?? "L'agent n'a pas pu être lancé.");
      return;
    }
    setSessionId(corps.session_id);
  };

  // Arrêt garanti par le code : la seule réponse possible ici refuse l'envoi par l'agent.
  const repondre = async (validationId: string) => {
    setLancement(true);
    const r = await fetch("/api/agent/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validation_id: validationId, decision: "refuse", message: "L'utilisateur relit et envoie lui-même. N'envoie rien." }),
    }).catch(() => null);
    setLancement(false);
    if (!r?.ok) setAlerte("Votre réponse n'a pas pu être transmise à l'agent.");
    else setRepondu(true);
  };

  return (
    <Screen nav="absence" className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title="Mode absence" />
      {logement.exemple && <ExempleTag />}

      <section className="relative h-[168px] flex-none overflow-hidden rounded-card bg-lilas p-5">
        <div className="flex max-w-[190px] flex-col gap-1">
          <h1 className="text-[23px] leading-7 font-extrabold">{prenom} s&apos;absente {jours} jours</h1>
          {absence.motif && <p className="text-sm text-lilas-ink">{absence.motif}</p>}
        </div>
        <Illus name="cles" width={120} className="absolute top-[18px] right-3 rotate-[10deg]" />
      </section>

      <div className="flex items-center justify-between rounded-full bg-white p-1.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nuit text-white"><Icon name="cal" size={16} /></span>
          <span className="flex flex-col text-[11px] text-ink-muted">
            Durée de l&apos;absence
            <b className="text-sm text-nuit">{jours} jours · {formaterDate(depart)} → {formaterDate(retour)}</b>
          </span>
        </span>
        <span className="flex gap-1.5">
          <RoundButton icon="minus" label="Un jour de moins" size={40} onClick={() => maj({ absenceJours: Math.max(1, jours - 1) })} />
          <RoundButton icon="plus" label="Un jour de plus" size={40} onClick={() => maj({ absenceJours: jours + 1 })} />
        </span>
      </div>

      {contrat && seuil != null ? (
        depasse ? (
          <div className="flex items-start gap-2.5 rounded-xl2 border-[1.5px] border-attention-icon bg-attention-bg px-3.5 py-3 text-attention-text">
            <Triangle size={22} />
            <p className="text-[13px] leading-[19px]">
              <b>Le contrat limite l&apos;absence à {seuil} jours.</b> Au-delà : {protections}. Clause p. {contrat.inoccupation!.page}.
            </p>
          </div>
        ) : (
          <p className="rounded-xl2 bg-succes-bg px-3.5 py-3 text-[13px] font-semibold text-succes-text">Sous le seuil de {seuil} jours du contrat : la déclaration n&apos;est pas obligatoire.</p>
        )
      ) : (
        <p className="rounded-xl2 bg-veille-bg px-3.5 py-3 text-[13px] text-veille-text">Sans contrat déposé, prévenir votre assureur reste recommandé pour une absence longue. L&apos;Opération Tranquillité Vacances est ouverte à tous.</p>
      )}

      <SectionTitle aside="Usage 3">Démarches préparées par l&apos;agent</SectionTitle>
      <ul className="flex flex-col gap-2">
        {demarches.map((d) => (
          <li key={d.titre} className={cx("flex items-center gap-3 rounded-[30px] p-2.5", d.tone)}>
            <span className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-full bg-white text-nuit"><Icon name={d.icon} size={22} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px]">{d.titre}</b>
              <span className={cx("text-xs leading-4", d.sub)}>{d.detail}</span>
            </span>
            {pret || (reel && Boolean(dossier?.recapitulatif || dossier?.otv_url_demarche)) ? <Signal kind="attention">À relire</Signal> : <span className="flex-none rounded-full bg-[#EEF0F6] px-2.5 py-1 text-[11px] font-bold text-nuit">À faire</span>}
          </li>
        ))}
      </ul>

      {reel && (alerte ?? suivi.erreur) && <p role="alert" className="rounded-xl2 bg-attention-bg px-3.5 py-3 text-[13px] font-semibold text-attention-text">{alerte ?? suivi.erreur}</p>}

      {reel && sessionId && !termine && !demande && (
        <p role="status" className="rounded-xl2 bg-info-bg px-3.5 py-3 text-[13px] font-semibold text-info-text">
          L&apos;agent consulte service-public.gouv.fr{contrat?.assureur ? ` et le site de ${contrat.assureur}` : ""}, sans se connecter. {suivi.etat?.run.nb_etapes ? `${suivi.etat.run.nb_etapes} étapes faites.` : "Session ouverte."}
        </p>
      )}

      {reel && demande && !repondu && (
        <section role="status" className="flex flex-col gap-2.5 rounded-[26px] border-[1.5px] border-attention-icon bg-white px-4 py-3.5">
          <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">L&apos;agent s&apos;est arrêté avant tout envoi</span>
          <p className="text-sm leading-5">{lireResume(demande.resume).texte || "Dossier prêt à relire."}</p>
          <Pill onClick={() => void repondre(demande.id)} disabled={lancement}>J&apos;ai lu : j&apos;envoie moi-même</Pill>
          <span className="text-xs text-ink-muted">L&apos;agent n&apos;est jamais autorisé à envoyer : cette réponse lui refuse l&apos;envoi et clôt sa mission.</span>
        </section>
      )}

      {reel && dossier && (dossier.recapitulatif || dossier.otv_url_demarche) && (
        <section className="flex flex-col gap-2.5 rounded-[26px] bg-white px-4 py-3.5 text-sm leading-5">
          <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Dossier préparé par l&apos;agent</span>
          {dossier.otv_url_demarche && (
            <p><b>Tranquillité vacances.</b> {dossier.otv_connexion_requise ? `Connexion : ${dossier.otv_connexion_requise}. ` : ""}{dossier.otv_delai ? `Délai : ${dossier.otv_delai}. ` : ""}
              <a href={dossier.otv_url_demarche} target="_blank" rel="noopener noreferrer" className="font-bold text-cobalt underline">Ouvrir la page officielle</a>
            </p>
          )}
          {dossier.otv_informations_demandees && <p className="whitespace-pre-line text-ink-soft"><b className="text-nuit">À préparer :</b>{"\n"}{sansBalises(dossier.otv_informations_demandees)}</p>}
          {(dossier.assureur_moyen || dossier.assureur_url) && (
            <p><b>Assureur.</b> {dossier.assureur_moyen ?? ""} {dossier.assureur_url && <a href={dossier.assureur_url} target="_blank" rel="noopener noreferrer" className="font-bold text-cobalt underline">Voir la page</a>}</p>
          )}
          {dossier.recapitulatif && <p className="whitespace-pre-line rounded-xl2 bg-creme px-3 py-2.5 text-[13px]">{sansBalises(dossier.recapitulatif)}</p>}
          {dossier.remarque && <p className="text-xs text-ink-muted">{dossier.remarque}</p>}
        </section>
      )}

      {pret && (
        <p className="rounded-xl2 bg-succes-bg px-3.5 py-3 text-[13px] font-semibold text-succes-text">
          Récapitulatif prêt : absence du {formaterDate(depart)} au {formaterDate(retour)} ({jours} jours){contrat?.assureur ? `, assureur ${contrat.assureur}` : ""}, demande de Tranquillité vacances à déposer avant le {formaterDate(otvFin)}. Connectez-vous vous-même sur service-public.gouv.fr, relisez et envoyez. Rien n&apos;a été envoyé.
        </p>
      )}

      <Note>L&apos;agent prépare le dossier sans aucun identifiant (ni FranceConnect, ni espace client) : la bonne démarche, ce qu&apos;il faut fournir, le message à l&apos;assureur. Vous vous connectez, relisez et envoyez vous-même.</Note>

      <ActionBar withNav>
        {pret ? (
          <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F34634" target="_blank" rel="noopener noreferrer" className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full bg-nuit px-6 text-base font-bold text-white">
            Ouvrir la démarche OTV
            <Icon name="arrow" size={18} />
          </a>
        ) : (
          <Pill onClick={reel ? () => void lancer() : () => setPret(true)} disabled={lancement || (reel && Boolean(sessionId) && !termine)}>
            {reel ? (lancement ? "Lancement…" : sessionId && !termine ? "L'agent prépare vos démarches…" : sessionId ? "Relancer l'agent" : "Demander à l'agent de préparer") : "Préparer le récapitulatif"}
          </Pill>
        )}
      </ActionBar>
    </Screen>
  );
}

/** Le récapitulatif de l'agent arrive parfois en Markdown : on retire les marques, le texte reste tel quel. */
function sansBalises(texte: string): string {
  return texte.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,4}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
}
