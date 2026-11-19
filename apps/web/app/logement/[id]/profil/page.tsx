"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BackButton, Chip, Header, Illus, Pill, Ring, Screen, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { LIBELLE_DEPLACEMENT, type Occupant } from "@/lib/domaine";

import { enregistrerProfil } from "../actions-serveur";

const TYPES = ["Studio", "T1", "T2", "T3", "T4", "T5+"];
const ETAGES: [string, number][] = [["RDC", 0], ["1er", 1], ["2e", 2], ["3e+", 3]];
const STATUTS: [string, "proprietaire" | "locataire" | "heberge"][] = [["Propriétaire", "proprietaire"], ["Locataire", "locataire"], ["Hébergé", "heberge"]];

/**
 * Écran 2 · Profil. Capacités fonctionnelles (déplacement 0 à 4, vue, audition, vigilance),
 * jamais de diagnostic. Données de santé (RGPD art. 9) : accord explicite et daté obligatoire.
 */
export default function PageProfil() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  // Depuis l'écran Compte : « occupant=<id> » modifie cet occupant, « occupant=nouveau » en ajoute un.
  // Sans paramètre : le premier occupant, celui du parcours d'inscription.
  const cible = useSearchParams().get("occupant");
  const [local, setLocal] = useState<Occupant>(
    () => logement.occupants?.find((x) => x.id === cible) ?? { libelle: "", deplacement: 0, vue_reduite: false, audition_reduite: false, troubles_memoire: false, consentement_art9_le: null },
  );
  const o = cible ? local : etat.occupant;
  const [type, setType] = useState(logement.type);
  const [etage, setEtage] = useState(logement.etage);
  const [statut, setStatut] = useState(logement.statut);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Ouvert depuis « Compte et profil » : on y revient après l'enregistrement, au lieu de reprendre le parcours.
  const depuisCompte = useSearchParams().get("depuis") === "compte";
  const suivant = depuisCompte ? `/logement/${logement.id}/compte` : `/logement/${logement.id}/contrat`;
  const setO = (p: Partial<Occupant>) => (cible ? setLocal({ ...o, ...p }) : maj({ occupant: { ...o, ...p } }));
  const accord = Boolean(o.consentement_art9_le);
  const prenomManquant = !logement.exemple && (!o.libelle.trim() || o.libelle === "l'occupant");
  const prenom = prenomManquant ? "La personne" : o.libelle;

  const continuer = async () => {
    if (logement.exemple) return router.push(suivant);
    setEnvoi(true);
    setErreur(null);
    const r = await enregistrerProfil({
      logement_id: logement.id,
      libelle: o.libelle,
      deplacement: o.deplacement,
      vue_reduite: o.vue_reduite,
      audition_reduite: o.audition_reduite,
      troubles_memoire: o.troubles_memoire,
      consentement_art9_le: o.consentement_art9_le!,
      type: TYPES.includes(type) ? type : undefined,
      etage: ETAGES.find(([l]) => l === etage)?.[1],
      statut_occupation: STATUTS.find(([l]) => l === statut)?.[1],
      occupant_id: cible && cible !== "nouveau" ? cible : undefined,
      nouveau: cible === "nouveau",
    });
    setEnvoi(false);
    if (r.ok) {
      router.push(suivant);
      router.refresh();
    }
    else setErreur(r.message ?? "Profil non enregistré.");
  };

  return (
    <Screen className="gap-3.5">
      <Header left={<BackButton href={depuisCompte ? suivant : "/"} />} title="Profil" right={depuisCompte ? undefined : <Ring value={1} total={3} size={48} track="#E3E5EE" />} />

      <section className="relative min-h-[150px] overflow-hidden rounded-card bg-pervenche p-5">
        <div className="flex max-w-[190px] flex-col gap-1.5">
          <h2 className="text-[22px] leading-[27px] font-extrabold">Qui vit dans ce logement ?</h2>
          {logement.exemple ? (
            <p className="text-sm leading-[19px] text-ink-soft">
              {o.libelle}, {o.age} ans, vit seule. On parle de capacités, pas de maladies.
            </p>
          ) : (
            <>
              <input
                value={o.libelle === "l'occupant" ? "" : o.libelle}
                onChange={(e) => setO({ libelle: e.target.value })}
                placeholder="Son prénom"
                maxLength={40}
                aria-label="Prénom de la personne"
                className="h-11 w-full rounded-full bg-white px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-nuit"
              />
              <p className="text-sm leading-[19px] text-ink-soft">On parle de capacités, pas de maladies.</p>
            </>
          )}
        </div>
        <Illus name="mains" width={128} className="absolute right-3.5 bottom-[18px]" />
      </section>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 flex w-full justify-between">
          <b className="text-[15px]">Se déplacer</b>
          <span className="text-[13px] font-semibold text-cobalt">
            {o.deplacement} · {LIBELLE_DEPLACEMENT[o.deplacement]}
          </span>
        </legend>
        <div className="flex justify-between rounded-full bg-white p-1.5" role="radiogroup" aria-label="Niveau de déplacement">
          {([0, 1, 2, 3, 4] as const).map((v) => {
            const on = v === o.deplacement;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${v}, ${LIBELLE_DEPLACEMENT[v]}`}
                onClick={() => setO({ deplacement: v })}
                className={cx("h-[52px] w-[52px] rounded-full border-[1.5px] text-[17px] font-extrabold", on ? "border-nuit bg-nuit text-white" : "border-line bg-white")}
              >
                {v}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2.5">
        <b className="text-[15px]">Voir, entendre, vigilance</b>
        <div className="flex flex-wrap gap-2">
          <Chip active={o.vue_reduite} onClick={() => setO({ vue_reduite: !o.vue_reduite })}>Vue réduite</Chip>
          <Chip active={o.audition_reduite} onClick={() => setO({ audition_reduite: !o.audition_reduite })}>Audition réduite</Chip>
          <Chip active={o.troubles_memoire} onClick={() => setO({ troubles_memoire: !o.troubles_memoire })}>Troubles de mémoire</Chip>
        </div>
      </div>

      {logement.exemple ? (
        <div className="flex gap-2">
          {[[logement.type, "logement"], [logement.etage, "étage"], [logement.statut, "statut"]].map(([v, l]) => (
            <span key={l} className="flex flex-1 flex-col rounded-[20px] bg-lilas-soft px-3.5 py-3 text-[13px] text-[#5A4470]">
              <b className="text-[15px] text-nuit">{v}</b>
              {l}
            </span>
          ))}
        </div>
      ) : (
        <section className="flex flex-col gap-2 rounded-[20px] bg-lilas-soft p-3">
          {[
            { libelle: "Logement", options: TYPES, valeur: type, set: setType },
            { libelle: "Étage", options: ETAGES.map(([l]) => l), valeur: etage, set: setEtage },
            { libelle: "Statut", options: STATUTS.map(([l]) => l), valeur: statut, set: setStatut },
          ].map((g) => (
            <div key={g.libelle} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[72px] text-[13px] font-semibold text-[#5A4470]">{g.libelle}</span>
              {g.options.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={g.valeur === v}
                  onClick={() => g.set(v)}
                  className={cx("h-8 rounded-full px-3 text-[13px] font-bold", g.valeur === v ? "bg-nuit text-white" : "bg-white text-nuit")}
                >
                  {v}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={accord}
        onClick={() => setO({ consentement_art9_le: accord ? null : new Date().toISOString().slice(0, 10) })}
        className={cx("flex items-start gap-3 rounded-xl2 border-[1.5px] bg-white px-4 py-3.5 text-left", accord ? "border-nuit" : "border-[#C9CCD9]")}
      >
        <span className={cx("flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-nuit text-sm font-extrabold text-white", accord ? "bg-nuit" : "bg-white")}>
          {accord ? "✓" : ""}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm leading-5 font-bold">{prenom} est d&apos;accord pour que ces informations servent à son diagnostic.</span>
          <span className="text-xs leading-[17px] text-ink-muted">
            Données de santé, article 9 du RGPD. Accord daté
            {accord ? ` du ${new Date(o.consentement_art9_le!).toLocaleDateString("fr-FR")}` : ""}, retirable.
          </span>
        </span>
      </button>

      <div className="mt-auto flex flex-col gap-2">
        {erreur && <p role="alert" className="rounded-[20px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text">{erreur}</p>}
        <Pill onClick={continuer} disabled={!accord || envoi || prenomManquant}>
          {!accord ? "Accord nécessaire pour continuer" : prenomManquant ? "Indiquez son prénom" : envoi ? "Enregistrement…" : "Continuer"}
        </Pill>
      </div>
    </Screen>
  );
}
