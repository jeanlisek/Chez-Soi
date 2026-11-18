"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";

import { MainsOuvertes } from "@/components/chez-soi/illustrations";
import { Bouton, Carte, Corps, Ecran, EnTete, Etape, Pied, Puce } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import { LIBELLE_DEPLACEMENT, type Occupant } from "@/lib/domaine";
import { cn } from "@/lib/utils";

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
  const o = etat.occupant;
  const [type, setType] = useState(logement.type);
  const [etage, setEtage] = useState(logement.etage);
  const [statut, setStatut] = useState(logement.statut);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const suivant = `/logement/${logement.id}/contrat`;
  const setO = (p: Partial<Occupant>) => maj({ occupant: { ...o, ...p } });
  const accord = Boolean(o.consentement_art9_le);

  return (
    <Ecran>
      <EnTete titre="Profil" retour="/" droite={<Etape n={1} sur={3} />} />
      <Corps>
        <Carte ton="lavande" className="flex items-center gap-2">
          <div className="flex-1">
            <h2 className="text-2xl leading-tight font-extrabold">Qui vit dans ce logement ?</h2>
            {logement.exemple ? (
              <p className="mt-1 text-sm text-encre-douce">
                {o.libelle}, {o.age} ans, vit seule. On parle de capacités, pas de maladies.
              </p>
            ) : (
              <input
                value={o.libelle === "l'occupant" ? "" : o.libelle}
                onChange={(e) => setO({ libelle: e.target.value })}
                placeholder="Prénom (ex. Jeanne)"
                maxLength={40}
                aria-label="Prénom de la personne"
                className="mt-2 h-11 w-full rounded-full bg-white/80 px-4 outline-none"
              />
            )}
          </div>
          <MainsOuvertes className="w-32 shrink-0" />
        </Carte>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-bold">Se déplacer</h3>
            <span className="text-sm font-semibold text-[#1c2f7a]">
              {o.deplacement} · {LIBELLE_DEPLACEMENT[o.deplacement]}
            </span>
          </div>
          <div className="flex justify-between rounded-full bg-white p-1.5" role="radiogroup" aria-label="Déplacement">
            {([0, 1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={o.deplacement === n}
                onClick={() => setO({ deplacement: n })}
                className={cn(
                  "grid size-12 place-items-center rounded-full border text-lg font-bold transition",
                  o.deplacement === n ? "border-encre bg-encre text-white" : "border-gris-ligne bg-white",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-bold">Voir, entendre, vigilance</h3>
          <div className="flex flex-wrap gap-2">
            <Puce actif={o.vue_reduite} onClick={() => setO({ vue_reduite: !o.vue_reduite })}>
              Vue réduite
            </Puce>
            <Puce actif={o.audition_reduite} onClick={() => setO({ audition_reduite: !o.audition_reduite })}>
              Audition réduite
            </Puce>
            <Puce actif={o.troubles_memoire} onClick={() => setO({ troubles_memoire: !o.troubles_memoire })}>
              Troubles de mémoire
            </Puce>
          </div>
        </section>

        {logement.exemple ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              [logement.type, "logement"],
              [logement.etage, "étage"],
              [logement.statut, "statut"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-lilas-clair px-3 py-3">
                <p className="font-bold">{v}</p>
                <p className="text-sm text-encre-douce">{l}</p>
              </div>
            ))}
          </div>
        ) : (
          <section className="flex flex-col gap-2 rounded-3xl bg-lilas-clair p-3">
            {[
              { libelle: "Logement", options: TYPES.map((t) => [t, t] as const), valeur: type, set: setType },
              { libelle: "Étage", options: ETAGES.map(([l]) => [l, l] as const), valeur: etage, set: setEtage },
              { libelle: "Statut", options: STATUTS.map(([l]) => [l, l] as const), valeur: statut, set: setStatut },
            ].map((g) => (
              <div key={g.libelle} className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 text-sm text-encre-douce">{g.libelle}</span>
                {g.options.map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => g.set(v)}
                    className={cn("rounded-full px-3 py-1.5 text-sm font-bold", g.valeur === v ? "bg-encre text-white" : "bg-white")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ))}
          </section>
        )}

        <button
          type="button"
          onClick={() =>
            setO({ consentement_art9_le: accord ? null : new Date().toISOString().slice(0, 10) })
          }
          className={cn(
            "flex items-start gap-3 rounded-3xl border-2 bg-white p-4 text-left",
            accord ? "border-encre" : "border-gris-ligne",
          )}
          aria-pressed={accord}
        >
          <span
            className={cn(
              "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2",
              accord ? "border-encre bg-encre text-white" : "border-gris-ligne",
            )}
          >
            {accord && <Check className="size-4" />}
          </span>
          <span>
            <span className="block font-bold">
              {o.libelle} est d&apos;accord pour que ces informations servent à son diagnostic.
            </span>
            <span className="text-sm text-encre-douce">
              Données de santé, article 9 du RGPD. Accord daté
              {accord ? ` du ${new Date(o.consentement_art9_le!).toLocaleDateString("fr-FR")}` : ""}, retirable.
            </span>
          </span>
        </button>
      </Corps>
      <Pied>
        {erreur && <p className="rounded-2xl bg-rouge-clair p-3 text-sm text-rouge">{erreur}</p>}
        <Bouton
          disabled={!accord || envoi || (!logement.exemple && (!o.libelle.trim() || o.libelle === "l'occupant"))}
          onClick={async () => {
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
            });
            setEnvoi(false);
            if (r.ok) router.push(suivant);
            else setErreur(r.message ?? "Profil non enregistré.");
          }}
        >
          {!accord ? "Accord nécessaire pour continuer" : envoi ? "Enregistrement…" : "Continuer"}
        </Bouton>
      </Pied>
    </Ecran>
  );
}
