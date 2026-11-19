"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BackButton, Chip, DateField, Field, Header, Illus, Pill, Ring, Screen, TextArea, cx } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import type { Occupant } from "@/lib/domaine";
import { AUDITION, ECHELLE_DEPLACEMENT, SEUIL_REDUIT, TRANCHE_LABEL, VUE, ageDe, avecNiveau, niveau, trancheDe, vigilance } from "@/lib/profil";

import { enregistrerProfil } from "../actions-serveur";

const TITRES = ["L'adresse du logement", "Les habitants", "Logement et accord"];
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
  const [etape, setEtape] = useState(1);
  const [adresse, setAdresse] = useState(logement.adresse ?? "");
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
  // Les échelles et les points de vigilance se lisent selon l'âge (date de naissance facultative).
  const age = ageDe(o.naissance) ?? o.age;
  const tranche = trancheDe(age);
  const echelle = ECHELLE_DEPLACEMENT[tranche];
  const vig = vigilance(tranche, age);
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
      nom: o.nom?.trim() || undefined,
      naissance: o.naissance || undefined,
      contraintes: o.contraintes ?? [],
      autre: o.autre?.trim() || undefined,
      adresse: adresse.trim(),
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
      <Header left={<BackButton href={depuisCompte ? suivant : "/"} />} title={TITRES[etape - 1]} right={<Ring value={etape} total={3} size={48} track="#E3E5EE" />} />

      {etape === 2 && (<>
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
            {o.deplacement} · {echelle[o.deplacement]}
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
                aria-label={`${v}, ${echelle[v]}`}
                onClick={() => setO({ deplacement: v })}
                className={cx("h-[52px] w-[52px] rounded-full border-[1.5px] text-[17px] font-extrabold", on ? "border-nuit bg-nuit text-white" : "border-line bg-white")}
              >
                {v}
              </button>
            );
          })}
        </div>
      </fieldset>

      {([["vue", "Voir", VUE] as const, ["audition", "Entendre", AUDITION] as const]).map(([cle, titre, echelle]) => {
        const n = niveau(o.contraintes, cle, cle === "vue" ? o.vue_reduite : o.audition_reduite);
        return (
          <div key={cle} className="flex flex-col gap-2">
            <span className="flex w-full justify-between"><b className="text-[15px]">{titre}</b><span className="text-[13px] font-semibold text-cobalt">{echelle[n]}</span></span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={titre}>
              {echelle.map((libelle, v) => (
                <Chip key={libelle} active={v === n} onClick={() => setO({ contraintes: avecNiveau(o.contraintes, cle, v), ...(cle === "vue" ? { vue_reduite: v >= SEUIL_REDUIT } : { audition_reduite: v >= SEUIL_REDUIT }) })}>{libelle}</Chip>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-2">
        <b className="text-[15px]">Points de vigilance{age !== undefined ? ` · ${TRANCHE_LABEL[tranche]}` : ""}</b>
        <p className="text-[13px] text-ink-muted">{vig.aide}</p>
        <div className="flex flex-wrap gap-2">
          {vig.options.map((x) => {
            const on = (o.contraintes ?? []).includes(x.id);
            return (
              <Chip key={x.id} active={on} onClick={() => setO({ contraintes: on ? (o.contraintes ?? []).filter((c) => c !== x.id) : [...(o.contraintes ?? []), x.id], ...(x.id === "memoire" ? { troubles_memoire: !on } : {}) })}>{x.label}</Chip>
            );
          })}
        </div>
      </div>
      {!logement.exemple && (
        <div className="flex flex-col gap-2.5 rounded-[26px] bg-white px-4 py-3.5">
          <Field id="nom" label="Nom (facultatif)" value={o.nom ?? ""} onChange={(v) => setO({ nom: v })} autoComplete="off" />
          <DateField id="naissance" label="Date de naissance (facultative)" value={o.naissance ?? ""} onChange={(v) => setO({ naissance: v || null })} />
        </div>
      )}
      </>)}

      {etape === 1 && (<>
      <section className="flex flex-col gap-1.5 rounded-card bg-pervenche p-5">
        <h2 className="text-[22px] leading-[27px] font-extrabold">{TITRES[0]}</h2>
        <p className="text-sm leading-[19px] text-ink-soft">D&apos;abord l&apos;adresse. Un compte, un logement.</p>
      </section>
      {!logement.exemple && <Field id="adresse" label="Adresse (facultative)" value={adresse} onChange={setAdresse} autoComplete="street-address" placeholder="12 rue des Lilas, Angers" />}
      </>)}

      {etape === 3 && (<>
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
        {!logement.exemple && <TextArea id="autre" label="Autre chose à savoir (facultatif)" value={o.autre ?? ""} onChange={(v) => setO({ autre: v })} />}
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
      </>)}

      <div className="mt-auto flex flex-col gap-2">
        {erreur && <p role="alert" className="rounded-[20px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text">{erreur}</p>}
        {etape < 3 ? (
          <Pill onClick={() => setEtape(etape + 1)} disabled={etape === 2 && prenomManquant}>{etape === 2 && prenomManquant ? "Indiquez son prénom" : "Continuer"}</Pill>
        ) : (
          <Pill onClick={continuer} disabled={!accord || envoi || prenomManquant}>
            {!accord ? "Accord nécessaire pour continuer" : envoi ? "Enregistrement…" : "Enregistrer le profil"}
          </Pill>
        )}
        {etape > 1 && <Pill onClick={() => setEtape(etape - 1)} variant="contour">Étape précédente</Pill>}
      </div>
    </Screen>
  );
}
