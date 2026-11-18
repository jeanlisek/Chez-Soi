"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Icon, Triangle } from "@/components/cs/icons";
import { ActionBar, BackButton, Header, Illus, Pill, RoundButton, Screen } from "@/components/cs/ui";
import { PROPOSITION_EXEMPLE } from "@/lib/demo/logement-exemple";
import { useParcours } from "@/lib/demo/etat";
import { formaterEuros } from "@/lib/domaine";

/**
 * Écran 10 · Validation (T18). Reprend exactement ce que l'agent envoie à `demander_validation`
 * (résumé, produit, montant, lien) et renvoie { decision: approuve | refuse | modifier, message? }.
 * Le panier reste dans le navigateur de H (T28) : l'utilisateur ajoute le produit lui-même depuis le lien.
 */
function LienProduit({ url, plein = false }: { url: string; plein?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={plein
        ? "flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-nuit text-[15px] font-bold text-white"
        : "flex items-center justify-between gap-3 rounded-full bg-white px-4 py-3 text-sm font-bold text-cobalt"}
    >
      Ouvrir la fiche produit
      <Icon name="arrow" size={16} />
      <span className="sr-only">(nouvel onglet)</span>
    </a>
  );
}

export default function PageValidation() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const p = PROPOSITION_EXEMPLE;
  const [modif, setModif] = useState(false);
  const [texte, setTexte] = useState("");

  const pasPret = etat.run === "aucun" || etat.run === "en_cours";
  const attente = !pasPret && !etat.decision;
  const envoyerModif = (e: FormEvent) => {
    e.preventDefault();
    maj({ decision: null, run: "en_cours" });
    router.push(`${base}/agent`);
  };

  return (
    <Screen nav="agent" className="gap-3">
      <Header left={<BackButton href={`${base}/agent`} />} title="Validation" right={<RoundButton icon="eye" label="Voir la trace de l'agent" href={`${base}/agent`} />} />

      {pasPret ? (
        <section className="flex flex-col items-center gap-3 rounded-card bg-pervenche p-6 text-center">
          <Illus name="navigateur" width={110} />
          <b className="text-lg">{etat.run === "aucun" ? "Aucune proposition pour l'instant" : "L'agent travaille encore"}</b>
          <p className="text-sm text-ink-soft">
            {etat.run === "aucun" ? "Lancez une mission depuis le plan d'action." : "Vous recevrez une notification quand sa proposition sera prête."}
          </p>
          <Pill href={etat.run === "aucun" ? `${base}/actions` : `${base}/agent`} variant="blanc">
            {etat.run === "aucun" ? "Voir le plan d'action" : "Suivre l'agent"}
          </Pill>
        </section>
      ) : etat.decision === "approuve" ? (
        <>
          <section role="status" className="relative flex min-h-[120px] flex-col justify-center gap-1 rounded-[28px] bg-pervenche py-[18px] pr-[18px] pl-[120px]">
            <Illus name="ok" width={84} className="absolute top-3 left-5" />
            <b className="text-lg">Choix approuvé</b>
            <span className="text-sm text-ink-soft">Ajoutez le produit à votre panier depuis le lien, puis payez sur le site.</span>
          </section>
          <section className="flex items-center justify-between gap-3 rounded-[26px] bg-white px-4 py-3.5">
            <b className="text-[15px] leading-5">{p.produit}</b>
            <span className="font-display text-xl">{formaterEuros(p.montant_eur)}</span>
          </section>
        </>
      ) : etat.decision === "refuse" ? (
        <section role="status" className="rounded-[26px] bg-white p-4 text-sm">
          <b className="text-base">Choix refusé.</b> L&apos;agent s&apos;est arrêté. Vous pouvez relancer la mission depuis le plan d&apos;action.
        </section>
      ) : (
        <>
          <section role="status" className="flex items-center gap-3 rounded-[26px] bg-attention-solid px-4 py-3.5 text-attention-on">
            <Triangle size={26} fill="#3B2600" mark="#E9A21B" />
            <span className="text-[15px] leading-5">
              <b>L&apos;agent attend votre décision</b>
              <br />
              Rien n&apos;est acheté ni payé.
            </span>
          </section>

          <section className="flex flex-col gap-1.5 rounded-[26px] bg-white px-4 py-3.5">
            <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Résumé de l&apos;agent</span>
            <p className="text-[15px] leading-6">{p.resume}</p>
          </section>

          <section className="flex flex-col gap-1 rounded-[26px] bg-white px-4 py-3.5">
            <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">{p.action === "panier" ? "Produit proposé" : "Démarche préparée"}</span>
            <div className="flex items-end justify-between gap-3">
              <span className="flex flex-col">
                <b className="text-base leading-5">{p.produit}</b>
                {p.dimensions && <span className="text-xs text-ink-muted">{p.dimensions}</span>}
              </span>
              <span className="flex-none font-display text-2xl leading-none">{formaterEuros(p.montant_eur)}</span>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-[26px] bg-pervenche-soft p-3">
            <LienProduit url={p.url} />
            <p className="px-1 text-xs leading-4 text-ink-soft">Le panier de l&apos;agent reste dans son navigateur. Si vous approuvez, ajoutez le produit vous-même depuis ce lien.</p>
          </section>
        </>
      )}

      {modif && attente && (
        <form onSubmit={envoyerModif} className="flex items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-[18px]">
          <label htmlFor="modif" className="sr-only-focusable">Que doit changer l&apos;agent ?</label>
          <input id="modif" autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Que doit changer l'agent ?" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          <button type="submit" className="h-11 rounded-full bg-nuit px-4 text-sm font-bold text-white">Envoyer</button>
        </form>
      )}

      <ActionBar withNav>
        {attente && (
          <>
            <Pill onClick={() => maj({ decision: "approuve", run: "termine" })}>Approuver</Pill>
            <div className="grid grid-cols-2 gap-2">
              <Pill variant="blanc" onClick={() => setModif(true)}>Modifier</Pill>
              <Pill variant="blanc" onClick={() => maj({ decision: "refuse", run: "termine" })}>Refuser</Pill>
            </div>
          </>
        )}
        {etat.decision === "approuve" && (
          <>
            <LienProduit url={p.url} plein />
            <Link href={`${base}/absence`} className="flex h-10 items-center justify-center text-[15px] font-bold">
              Préparer l&apos;absence de {logement.occupant.libelle}
            </Link>
          </>
        )}
        {etat.decision === "refuse" && <Pill href={`${base}/actions`}>Retour au plan d&apos;action</Pill>}
      </ActionBar>
    </Screen>
  );
}
