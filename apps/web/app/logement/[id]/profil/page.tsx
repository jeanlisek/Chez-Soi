"use client";

import { Check } from "lucide-react";

import { MainsOuvertes } from "@/components/chez-soi/illustrations";
import { Bouton, Carte, Corps, Ecran, EnTete, Etape, Pied, Puce } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import { LIBELLE_DEPLACEMENT, type Occupant } from "@/lib/domaine";
import { cn } from "@/lib/utils";

/**
 * Écran 2 · Profil. Capacités fonctionnelles (déplacement 0 à 4, vue, audition, vigilance),
 * jamais de diagnostic. Données de santé (RGPD art. 9) : accord explicite et daté obligatoire.
 */
export default function PageProfil() {
  const { logement, etat, maj } = useParcours();
  const o = etat.occupant;
  const setO = (p: Partial<Occupant>) => maj({ occupant: { ...o, ...p } });
  const accord = Boolean(o.consentement_art9_le);

  return (
    <Ecran>
      <EnTete titre="Profil" retour="/" droite={<Etape n={1} sur={3} />} />
      <Corps>
        <Carte ton="lavande" className="flex items-center gap-2">
          <div className="flex-1">
            <h2 className="text-2xl leading-tight font-extrabold">Qui vit dans ce logement ?</h2>
            <p className="mt-1 text-sm text-encre-douce">
              {o.libelle}, {o.age} ans, vit seule. On parle de capacités, pas de maladies.
            </p>
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
        <Bouton href={`/logement/${logement.id}/contrat`} disabled={!accord}>
          {accord ? "Continuer" : "Accord nécessaire pour continuer"}
        </Bouton>
      </Pied>
    </Ecran>
  );
}
