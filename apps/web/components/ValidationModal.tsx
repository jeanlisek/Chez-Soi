"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";

import { Bouton } from "@/components/chez-soi/ui";
import { formaterEuros, type PropositionAgent } from "@/lib/domaine";

/**
 * Validation humaine (T18). Reprend exactement les champs de `demander_validation` :
 * action, résumé, produit, montant, lien ; décision approuve, refuse ou modifier.
 * L'agent est en pause tant que la décision n'est pas prise ; il ne paie jamais.
 * Le panier de l'agent reste dans son navigateur : Marc ajoute le produit lui-même (T28).
 */
export function ValidationModal({
  proposition,
  onDecision,
  enCours,
}: {
  proposition: PropositionAgent;
  onDecision: (d: "approuve" | "refuse" | "modifier") => void;
  enCours?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[24px] bg-ambre px-4 py-3">
        <AlertTriangle className="size-6 shrink-0" />
        <div>
          <p className="font-bold">L&apos;agent attend votre décision</p>
          <p>Rien n&apos;est acheté ni payé.</p>
        </div>
      </div>
      <section className="rounded-[24px] bg-white p-4">
        <h2 className="text-xs font-bold tracking-wider text-encre-douce uppercase">Résumé de l&apos;agent</h2>
        <p className="mt-1">{proposition.resume}</p>
      </section>
      <section className="rounded-[24px] bg-white p-4">
        <h2 className="text-xs font-bold tracking-wider text-encre-douce uppercase">
          {proposition.action === "panier" ? "Produit proposé" : "Démarche préparée"}
        </h2>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <p className="font-bold">{proposition.produit}</p>
            {proposition.dimensions && <p className="text-sm text-encre-douce">{proposition.dimensions}</p>}
          </div>
          <p className="text-3xl font-black tracking-tight whitespace-nowrap">{formaterEuros(proposition.montant_eur)}</p>
        </div>
      </section>
      <section className="rounded-[24px] bg-lavande-claire p-3">
        <a
          href={proposition.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-full bg-white px-4 py-3 font-bold text-[#1a3a86]"
        >
          Ouvrir la fiche produit <ChevronRight className="size-4" />
        </a>
        <p className="mt-2 px-1 text-sm text-encre-douce">
          Le panier de l&apos;agent reste dans son navigateur. Si vous approuvez, ajoutez le produit vous-même depuis ce
          lien.
        </p>
      </section>
      <div className="mt-2 flex flex-col gap-2">
        <Bouton onClick={() => onDecision("approuve")} disabled={enCours}>
          Approuver
        </Bouton>
        <div className="grid grid-cols-2 gap-2">
          <Bouton variante="blanc" onClick={() => onDecision("modifier")} disabled={enCours}>
            Modifier
          </Bouton>
          <Bouton variante="blanc" onClick={() => onDecision("refuse")} disabled={enCours}>
            Refuser
          </Bouton>
        </div>
      </div>
    </div>
  );
}
