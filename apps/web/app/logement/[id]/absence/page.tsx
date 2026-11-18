"use client";

import { useState } from "react";

import { Icon, Triangle, type IconName } from "@/components/cs/icons";
import { ActionBar, BackButton, ExempleTag, Header, Illus, Note, Pill, RoundButton, Screen, SectionTitle, Signal, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { formaterDate } from "@/lib/domaine";

function ajouterJours(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Écran 11 · Mode absence (usage 3 : préparer sans jamais envoyer). Compare la durée au seuil
 * d'inoccupation du contrat (parcours A) et calcule la fenêtre de l'Opération tranquillité vacances :
 * au plus tôt 45 jours avant le départ, au plus tard 3 jours avant (police) ou la veille (gendarmerie),
 * d'après service-public.gouv.fr (F34634). Aucun identifiant chez l'agent : l'utilisateur envoie lui-même.
 */
export default function PageAbsence() {
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [pret, setPret] = useState(false);
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

  const demarches: { icon: IconName; titre: string; detail: string; tone: string; sub: string }[] = [
    ...(contrat && depasse
      ? [{ icon: "shield" as const, titre: `Prévenir ${contrat.assureur}`, detail: `Absence au-delà des ${seuil} jours du contrat (p. ${contrat.inoccupation!.page})`, tone: "bg-nuit text-white", sub: "text-[#C9D6EE]" }]
      : []),
    { icon: "police", titre: "Tranquillité vacances", detail: `Du ${formaterDate(otvDebut)} au ${formaterDate(otvFin)} (${zone === "police" ? "police" : "gendarmerie"})`, tone: "bg-pervenche", sub: "text-ink-soft" },
    { icon: "mail", titre: "Garde du courrier", detail: "En option, pour une boîte qui ne déborde pas", tone: "bg-white", sub: "text-ink-muted" },
  ];

  return (
    <Screen nav="absence" className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title="Mode absence" right={<RoundButton icon="bell" label="Rappels" />} />
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
              <b>Le contrat limite l&apos;absence à {seuil} jours.</b> Au-delà : {contrat.inoccupation!.protections.join(", ").toLowerCase()}. Clause p. {contrat.inoccupation!.page}.
            </p>
          </div>
        ) : (
          <p className="rounded-xl2 bg-succes-bg px-3.5 py-3 text-[13px] font-semibold text-succes-text">Sous le seuil de {seuil} jours du contrat : pas de déclaration à faire.</p>
        )
      ) : (
        <p className="rounded-xl2 bg-veille-bg px-3.5 py-3 text-[13px] text-veille-text">Parcours sans contrat : seule l&apos;Opération Tranquillité Vacances est proposée.</p>
      )}

      <SectionTitle aside="Usage 3">Démarches de l&apos;agent</SectionTitle>
      <ul className="flex flex-col gap-2">
        {demarches.map((d) => (
          <li key={d.titre} className={cx("flex items-center gap-3 rounded-[30px] p-2.5", d.tone)}>
            <span className="flex h-[50px] w-[50px] flex-none items-center justify-center rounded-full bg-white text-nuit"><Icon name={d.icon} size={22} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px]">{d.titre}</b>
              <span className={cx("text-xs leading-4", d.sub)}>{d.detail}</span>
            </span>
            {pret ? <Signal kind="attention">À relire</Signal> : <span className="flex-none rounded-full bg-[#EEF0F6] px-2.5 py-1 text-[11px] font-bold text-nuit">Prêt</span>}
          </li>
        ))}
      </ul>

      {pret && (
        <p className="rounded-xl2 bg-succes-bg px-3.5 py-3 text-[13px] font-semibold text-succes-text">
          Récapitulatif prêt. Connectez-vous vous-même sur service-public.gouv.fr, relisez et envoyez. Rien n&apos;a été envoyé.
        </p>
      )}

      <Note>L&apos;agent prépare les formulaires sans identifiant (ni FranceConnect, ni espace client). Vous vous connectez, relisez et envoyez vous-même.</Note>

      <ActionBar withNav>
        {pret ? (
          <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F34634" target="_blank" rel="noopener noreferrer" className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full bg-nuit px-6 text-base font-bold text-white">
            Ouvrir la démarche OTV
            <Icon name="arrow" size={18} />
          </a>
        ) : (
          <Pill onClick={() => setPret(true)}>Je suis connecté, préparer</Pill>
        )}
      </ActionBar>
    </Screen>
  );
}
