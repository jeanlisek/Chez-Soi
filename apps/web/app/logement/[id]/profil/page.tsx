"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { InfosDeBase, LogementEditor, OccupantsEditor } from "@/components/cs/profil";
import { BackButton, ExempleTag, Header, Illus, Pill, RoundButton, Ring, Screen, SectionTitle, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { basesCompletes, brouillonDepuis, logementComplet, occupantComplet, versEnregistrement, type Brouillon } from "@/lib/profil";

import { enregistrerProfilComplet } from "../actions-serveur";

const ETAPES = ["Infos de base", "Habitants", "Logement et accord"];

/**
 * Écran 2 · Profil en trois temps (maquette de Hoang-Kim) : les infos de base, puis chaque habitant,
 * puis le logement et l'accord. Capacités fonctionnelles, jamais de diagnostic. Données de santé
 * (RGPD art. 9) : accord explicite et daté obligatoire avant tout enregistrement.
 */
export default function PageProfil() {
  const router = useRouter();
  const { logement } = useParcours();
  const depuisCompte = useSearchParams().get("depuis") === "compte";
  const base = `/logement/${logement.id}`;
  const suivant = depuisCompte ? `${base}/compte` : `${base}/contrat`;

  const [b, setB] = useState<Brouillon>(() => brouillonDepuis(logement));
  const maj = (p: Partial<Brouillon>) => setB((x) => ({ ...x, ...p }));
  const [etape, setEtape] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const n = b.occupants.length;
  const seul = n === 1 ? b.occupants[0] : undefined;
  const basesOk = basesCompletes(b);
  const habitantsOk = b.occupants.every(occupantComplet);
  const logementOk = logementComplet(b);
  const accord = Boolean(b.accordLe);
  const aller = (e: number) => {
    setEtape(e);
    window.scrollTo({ top: 0 });
  };

  const terminer = async () => {
    if (logement.exemple) return router.push(suivant);
    setEnvoi(true);
    setErreur(null);
    const r = await enregistrerProfilComplet(versEnregistrement(logement.id, b));
    if (r.ok) {
      // Le bouton reste bloqué jusqu'au changement d'écran : un second appui n'enregistre rien en double.
      router.push(suivant);
      router.refresh();
      return;
    }
    setEnvoi(false);
    setErreur(r.message ?? "Profil non enregistré.");
  };

  return (
    <Screen className="gap-3.5">
      <Header
        left={etape === 0 ? <BackButton href={depuisCompte ? `${base}/compte` : "/"} /> : <RoundButton icon="back" label="Étape précédente" onClick={() => aller(etape - 1)} />}
        title="Profil"
        right={<Ring value={1} total={3} size={48} track="#E3E5EE" />}
      />
      {logement.exemple && <ExempleTag />}

      <ol className="grid grid-cols-3 gap-1.5" aria-label={`Étape ${etape + 1} sur 3 : ${ETAPES[etape]}`}>
        {ETAPES.map((e, i) => (
          <li key={e} className="flex flex-col gap-1">
            <span className={cx("h-1.5 rounded-full transition-colors duration-300", i <= etape ? "bg-nuit" : "bg-line")} />
            <span className={cx("text-[11px] font-bold", i === etape ? "text-nuit" : "text-ink-muted")}>{e}</span>
          </li>
        ))}
      </ol>

      {etape === 0 && (
        <div key="e0" className="anim-in flex flex-col gap-3.5">
          <section className="relative h-[150px] flex-none overflow-hidden rounded-card bg-pervenche p-5">
            <div className="flex max-w-[178px] flex-col gap-1.5">
              <h2 className="text-[22px] leading-[27px] font-extrabold">Qui vit dans ce logement ?</h2>
              <p className="text-sm leading-[19px] text-ink-soft">D&apos;abord la personne et son adresse. Un compte, un logement.</p>
            </div>
            <Illus name="mains" width={128} className="absolute right-3.5 bottom-[18px]" />
          </section>
          <InfosDeBase b={b} maj={maj} />
        </div>
      )}

      {etape === 1 && (
        <div key="e1" className="anim-in flex flex-col gap-3">
          <SectionTitle aside={`${n} personne${n > 1 ? "s" : ""}`}>Les habitants</SectionTitle>
          <p className="-mt-1.5 text-[13px] leading-[18px] text-ink-muted">Renseignez chaque habitant. On parle de capacités, pas de maladies.</p>
          <OccupantsEditor b={b} maj={maj} ouvertParDefaut />
        </div>
      )}

      {etape === 2 && (
        <div key="e2" className="anim-in flex flex-col gap-3.5">
          <SectionTitle>Le logement</SectionTitle>
          <LogementEditor b={b} maj={maj} ouvert={!logementOk} />
          <button
            type="button"
            role="checkbox"
            aria-checked={accord}
            onClick={() => maj({ accordLe: accord ? null : new Date().toISOString().slice(0, 10) })}
            className={cx("flex items-start gap-3 rounded-xl2 border-[1.5px] bg-white px-4 py-3.5 text-left transition-colors duration-200", accord ? "border-nuit" : "border-[#C9CCD9]")}
          >
            <span className={cx("flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-nuit text-sm font-extrabold text-white transition-colors duration-200", accord ? "bg-nuit" : "bg-white")}>
              {accord && <span className="anim-pop">✓</span>}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm leading-5 font-bold">
                {seul ? `${seul.prenom || "La personne"} est d'accord pour que ces informations servent à son diagnostic.` : "Les habitants sont d'accord pour que ces informations servent au diagnostic."}
              </span>
              <span className="text-xs leading-[17px] text-ink-muted">
                Données de santé, article 9 du RGPD. Accord daté{accord ? ` du ${new Date(b.accordLe!).toLocaleDateString("fr-FR")}` : ""}, retirable.
              </span>
            </span>
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {erreur && <p role="alert" className="rounded-[20px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text">{erreur}</p>}
        {etape === 0 && <Pill onClick={() => aller(1)} disabled={!basesOk}>{basesOk ? `Suivant · ${n} habitant${n > 1 ? "s" : ""}` : "Infos de base à compléter"}</Pill>}
        {etape === 1 && <Pill onClick={() => aller(2)} disabled={!habitantsOk}>{habitantsOk ? "Suivant" : "Complétez chaque habitant"}</Pill>}
        {etape === 2 && (
          <Pill onClick={() => void terminer()} disabled={!accord || !logementOk || envoi}>
            {!logementOk ? "Type, étage et statut à choisir" : !accord ? "Accord nécessaire pour continuer" : envoi ? "Enregistrement…" : depuisCompte ? "Enregistrer" : "Continuer"}
          </Pill>
        )}
      </div>
    </Screen>
  );
}
