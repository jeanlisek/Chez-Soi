"use client";

import { CalendarDays, Lock, Mail, Minus, Plus, ShieldCheck, ShieldAlert } from "lucide-react";

import { TrousseauCles } from "@/components/chez-soi/illustrations";
import { formaterDate, type Contrat } from "@/lib/domaine";
import { cn } from "@/lib/utils";

function ajouterJours(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mode absence. Compare la durée au seuil d'inoccupation du contrat (parcours A) et calcule la
 * fenêtre de l'Opération tranquillité vacances : au plus tôt 45 jours avant le départ, au plus tard
 * 3 jours avant (police) ou la veille (gendarmerie), d'après service-public.gouv.fr (F34634).
 */
export function ModeAbsence({
  occupant,
  motif,
  depart,
  jours,
  onJours,
  contrat,
  zone,
}: {
  occupant: string;
  motif: string;
  depart: string;
  jours: number;
  onJours: (n: number) => void;
  contrat: Contrat | null;
  zone: "police" | "gendarmerie";
}) {
  const retour = ajouterJours(depart, jours);
  const seuil = contrat?.inoccupation?.duree_max_jours;
  const depasse = seuil != null && jours > seuil;
  const otvDebut = ajouterJours(depart, -45);
  const otvFin = ajouterJours(depart, zone === "police" ? -3 : -1);

  const demarches = [
    ...(contrat && depasse
      ? [
          {
            Icone: ShieldAlert,
            titre: `Prévenir ${contrat.assureur}`,
            detail: `Absence de ${jours} jours, au-delà des ${seuil} jours du contrat (p. ${contrat.inoccupation!.page})`,
            ton: "lilas",
          },
        ]
      : []),
    {
      Icone: ShieldCheck,
      titre: "Tranquillité vacances",
      detail: `Du ${formaterDate(otvDebut)} au ${formaterDate(otvFin)} (${zone === "police" ? "police, 3 jours avant" : "gendarmerie, la veille"})`,
      ton: "lavande",
    },
    {
      Icone: Mail,
      titre: "Garde du courrier",
      detail: "En option, pour une boîte qui ne déborde pas",
      ton: "blanc",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-[28px] bg-lilas p-5">
        <div>
          <h1 className="text-2xl leading-tight font-extrabold">
            {occupant} s&apos;absente {jours} jours
          </h1>
          <p className="text-encre-douce">{motif}</p>
        </div>
        <TrousseauCles className="w-28 shrink-0" />
      </div>

      <div className="flex items-center gap-3 rounded-full bg-white p-2">
        <span className="grid size-11 place-items-center rounded-full bg-encre text-white">
          <CalendarDays className="size-5" />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-xs text-encre-douce">Durée de l&apos;absence</p>
          <p className="font-bold">
            {jours} jours · {formaterDate(depart)} → {formaterDate(retour)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Un jour de moins"
          onClick={() => onJours(Math.max(1, jours - 1))}
          className="grid size-11 place-items-center rounded-full border border-gris-ligne"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Un jour de plus"
          onClick={() => onJours(jours + 1)}
          className="grid size-11 place-items-center rounded-full border border-gris-ligne"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <p className="rounded-2xl bg-gris-ligne/50 p-3 text-sm text-encre-douce">
        {contrat
          ? depasse
            ? `Le contrat ${contrat.assureur} fixe l'inoccupation à ${seuil} jours : il faut prévenir l'assureur et appliquer les protections exigées.`
            : `Absence sous le seuil de ${seuil} jours du contrat : l'Opération tranquillité vacances suffit.`
          : "Parcours sans contrat : seule l'Opération tranquillité vacances est proposée."}
      </p>

      {contrat?.inoccupation && depasse && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-white p-4 text-sm">
          <li className="font-bold">Protections exigées (p. {contrat.inoccupation.page})</li>
          {contrat.inoccupation.protections.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Démarches de l&apos;agent</h2>
        <span className="text-sm font-bold text-[#1a3a86]">Usage 3</span>
      </div>
      <ul className="flex flex-col gap-2">
        {demarches.map(({ Icone, titre, detail, ton }) => (
          <li
            key={titre}
            className={cn(
              "flex items-center gap-3 rounded-[24px] p-3",
              ton === "lilas" && "bg-lilas-clair",
              ton === "lavande" && "bg-lavande",
              ton === "blanc" && "bg-white",
            )}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white">
              <Icone className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-bold">{titre}</span>
              <span className="text-sm text-encre-douce">{detail}</span>
            </span>
            <span className="rounded-full border border-ambre bg-ambre-clair px-2.5 py-0.5 text-xs font-bold">À relire</span>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-sm text-encre-douce">
        <Lock className="mt-0.5 size-4 shrink-0" />
        L&apos;agent prépare les formulaires sans identifiant (ni FranceConnect, ni espace client). Vous vous connectez,
        relisez et envoyez vous-même. Il n&apos;envoie rien.
      </p>
    </div>
  );
}
