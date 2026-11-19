"use client";

import { useState } from "react";

import { Icon } from "@/components/cs/icons";
import { Chip, DateField, Field, Select, Stepper, TextArea, cx } from "@/components/cs/ui";
import {
  AUDITION,
  ECHELLE_DEPLACEMENT,
  ETAGES,
  STATUTS,
  TRANCHE_LABEL,
  TYPES_LOGEMENT,
  VUE,
  ageDe,
  nomComplet,
  nouvelOccupant,
  occupantComplet,
  resumeOccupant,
  trancheDe,
  vigilance,
  type Brouillon,
  type OccupantBrouillon,
} from "@/lib/profil";

/**
 * Blocs partagés par l'écran Profil (inscription) et l'écran Profil de l'app (compte), repris de la
 * maquette de Hoang-Kim. Ils modifient un brouillon local ; l'écran parent l'enregistre en base.
 */
type Props = { b: Brouillon; maj: (p: Partial<Brouillon>) => void };

const majOccupant = (b: Brouillon, cle: string, p: Partial<OccupantBrouillon>): Partial<Brouillon> => ({
  occupants: b.occupants.map((o) => (o.cle === cle ? { ...o, ...p } : o)),
});

/** En changeant de date, on garde seulement les points de vigilance qui existent encore pour le nouvel âge. */
const avecNaissance = (o: OccupantBrouillon, naissance: string): Partial<OccupantBrouillon> => {
  const a = ageDe(naissance);
  const ids = vigilance(trancheDe(a), a).options.map((x) => x.id);
  return { naissance, vigilance: o.vigilance.filter((x) => ids.includes(x)) };
};

/* ---------- Infos de base : la personne, son adresse, le nombre d'habitants ---------- */

export function InfosDeBase({ b, maj }: Props) {
  const p = b.occupants[0];
  const n = b.occupants.length;
  const age = ageDe(p.naissance);
  const nombre = (v: number) => {
    if (v > n) maj({ occupants: [...b.occupants, ...Array.from({ length: v - n }, nouvelOccupant)] });
    else if (v < n && v >= 1) maj({ occupants: b.occupants.slice(0, v) });
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl2 bg-white px-4 py-4">
      <div className="flex gap-2">
        <Field id="base-prenom" label="Prénom" value={p.prenom} onChange={(x) => maj(majOccupant(b, p.cle, { prenom: x }))} placeholder="Ex. Jeanne" autoComplete="off" />
        <Field id="base-nom" label="Nom" value={p.nom} onChange={(x) => maj(majOccupant(b, p.cle, { nom: x }))} placeholder="Ex. Martin" autoComplete="off" />
      </div>
      <DateField
        id="base-naissance"
        label="Date de naissance"
        value={p.naissance}
        onChange={(x) => maj(majOccupant(b, p.cle, avecNaissance(p, x)))}
        aside={age !== undefined && <span key={age} className="anim-pop rounded-full bg-lilas-soft px-2.5 py-0.5 text-xs font-bold text-[#5A4470]">{age} an{age > 1 ? "s" : ""}</span>}
      />
      <Field id="base-adresse" label="Adresse du logement" value={b.adresse} onChange={(x) => maj({ adresse: x })} placeholder="Ex. 12 rue des Tilleuls, 69003 Lyon" autoComplete="street-address" />
      <div className="flex items-center justify-between gap-3 border-t border-[#EFF0F5] pt-3">
        <b className="text-[15px] leading-5">Combien de personnes vivent ici ?</b>
        <Stepper label="Nombre d'habitants" value={n} onChange={nombre} min={1} max={12} />
      </div>
    </div>
  );
}

/* ---------- Habitants ---------- */

export function OccupantsEditor({ b, maj, ouvertParDefaut }: Props & { ouvertParDefaut?: boolean }) {
  const occupants = b.occupants;
  const [ouvert, setOuvert] = useState<string | undefined>(ouvertParDefaut ? (occupants.find((o) => !occupantComplet(o)) ?? occupants[0])?.cle : undefined);
  return (
    <div className="flex flex-col gap-2">
      {occupants.map((o, i) => (
        <OccupantCard
          key={o.cle}
          o={o}
          principal={i === 0}
          ouvert={ouvert === o.cle}
          basculer={() => setOuvert(ouvert === o.cle ? undefined : o.cle)}
          maj={(p) => maj(majOccupant(b, o.cle, p))}
          retirer={i > 0 ? () => { maj({ occupants: occupants.filter((x) => x.cle !== o.cle) }); setOuvert(undefined); } : undefined}
        />
      ))}
    </div>
  );
}

function OccupantCard({ o, principal, ouvert, basculer, maj, retirer }: { o: OccupantBrouillon; principal?: boolean; ouvert: boolean; basculer: () => void; maj: (p: Partial<OccupantBrouillon>) => void; retirer?: () => void }) {
  const age = ageDe(o.naissance);
  const t = trancheDe(age);
  const v = vigilance(t, age);
  const echelle = ECHELLE_DEPLACEMENT[t];
  const basculerVigilance = (id: string) => maj({ vigilance: o.vigilance.includes(id) ? o.vigilance.filter((x) => x !== id) : [...o.vigilance, id] });

  return (
    <section className={cx("rounded-xl2 border-[1.5px] bg-white transition-colors duration-200", ouvert ? "border-nuit" : "border-white")}>
      <button type="button" onClick={basculer} aria-expanded={ouvert} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-pervenche-soft text-[17px] font-extrabold text-cobalt">{(o.prenom || "?").charAt(0).toUpperCase()}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className={cx("truncate text-[15px]", !o.prenom && "text-ink-muted")}>{nomComplet(o)}</b>
          <span className={cx("truncate text-xs", age === undefined ? "font-semibold text-attention-text" : "text-ink-muted")}>{resumeOccupant(o)}</span>
        </span>
        <Icon name="down" size={20} className={cx("text-ink-muted transition-transform duration-300", ouvert && "rotate-180")} />
      </button>

      {ouvert && (
        <div className="anim-in flex flex-col gap-4 border-t border-[#EFF0F5] px-4 pt-3.5 pb-4">
          {principal ? (
            <p className="rounded-[18px] bg-creme px-3.5 py-2.5 text-xs leading-[17px] text-ink-muted">Nom, prénom et date de naissance viennent des infos de base.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Field id={`prenom-${o.cle}`} label="Prénom" value={o.prenom} onChange={(x) => maj({ prenom: x })} placeholder="Ex. Léa" autoComplete="off" invalid={!o.prenom} />
                <Field id={`nom-${o.cle}`} label="Nom" value={o.nom} onChange={(x) => maj({ nom: x })} placeholder="Martin" autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <DateField
                  id={`naissance-${o.cle}`}
                  label="Date de naissance"
                  value={o.naissance}
                  onChange={(x) => maj(avecNaissance(o, x))}
                  aside={age !== undefined && <span key={t} className="anim-pop rounded-full bg-lilas-soft px-2.5 py-0.5 text-xs font-bold text-[#5A4470]">{age} an{age > 1 ? "s" : ""} · {TRANCHE_LABEL[t]}</span>}
                />
                <p className="text-xs leading-[17px] text-ink-muted">Un enfant et un senior n&apos;ont pas les mêmes risques : les questions s&apos;adaptent à l&apos;âge.</p>
              </div>
            </>
          )}

          {age === undefined ? (
            <p className="rounded-[18px] bg-veille-bg px-3.5 py-3 text-[13px] leading-[18px] font-semibold text-veille-text">Renseignez la date de naissance : les questions suivantes dépendent de l&apos;âge.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Select id={`deplacement-${o.cle}`} label="Se déplacer" value={echelle[o.deplacement] ?? ""} options={echelle} onChange={(x) => maj({ deplacement: echelle.indexOf(x) })} />
                {t === "bebe" && <p className="text-xs leading-[17px] text-ink-muted">Avant 3 ans, on suit le stade de l&apos;enfant : il change vite, pensez à le mettre à jour.</p>}
              </div>

              {t !== "bebe" && (
                <div className="flex flex-col gap-2.5">
                  <b className="text-[15px]">Voir, entendre</b>
                  <Select id={`vue-${o.cle}`} label="Vue" value={VUE[o.vue] ?? ""} options={VUE} onChange={(x) => maj({ vue: VUE.indexOf(x) })} />
                  <Select id={`audition-${o.cle}`} label="Audition" value={AUDITION[o.audition] ?? ""} options={AUDITION} onChange={(x) => maj({ audition: AUDITION.indexOf(x) })} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div>
                  <b className="block text-[15px]">Vigilance</b>
                  <p key={v.aide} className="anim-in text-xs leading-[17px] text-ink-muted">{v.aide}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.options.map((x) => (
                    <Chip key={x.id} active={o.vigilance.includes(x.id)} onClick={() => basculerVigilance(x.id)}>{x.label}</Chip>
                  ))}
                </div>
              </div>

              <TextArea
                id={`autre-${o.cle}`}
                label="Autre chose à savoir ?"
                value={o.autre}
                onChange={(x) => maj({ autre: x })}
                placeholder={t === "bebe" || t === "enfant" ? "Ex. dort en mezzanine, a peur du noir, chien à la maison…" : "Ex. se lève tôt, chat dans les pieds, habitudes à connaître…"}
              />
            </>
          )}

          {retirer && (
            <button type="button" onClick={retirer} className="flex h-9 items-center gap-1.5 self-start text-[13px] font-bold text-ink-muted">
              <Icon name="trash" size={16} />Retirer {o.prenom || "cette personne"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- Logement ---------- */

export function LogementEditor({ b, maj, ouvert }: Props & { ouvert?: boolean }) {
  const [edition, setEdition] = useState(Boolean(ouvert));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 rounded-xl2 bg-white px-4 py-3">
        <Icon name="home" size={20} className="text-cobalt" />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="text-sm">Type, étage, statut</b>
          <span className="text-xs text-ink-muted">Escaliers, ascenseur : les conseils en tiennent compte.</span>
        </span>
        <button type="button" onClick={() => setEdition(!edition)} aria-expanded={edition} className="h-9 flex-none rounded-full bg-pervenche-soft px-3.5 text-xs font-bold text-cobalt transition active:scale-95">
          {edition ? "Terminer" : "Modifier"}
        </button>
      </div>

      <div className="flex gap-2">
        {[[b.type || "–", "logement"], [b.etage ? b.etage + (b.ascenseur ? " · asc." : "") : "–", "étage"], [b.statut || "–", "statut"]].map(([val, lab]) => (
          <span key={lab} className="flex flex-1 flex-col rounded-[20px] bg-lilas-soft px-3.5 py-3 text-[13px] text-[#5A4470]">
            <b key={val} className="anim-in text-[15px] text-nuit">{val}</b>
            {lab}
          </span>
        ))}
      </div>

      {edition && (
        <div className="anim-in flex flex-col gap-3.5 rounded-xl2 bg-white px-4 py-4">
          <div className="flex gap-2">
            <Select id="type" label="Type" value={b.type} options={TYPES_LOGEMENT} onChange={(x) => maj({ type: x })} />
            <Select id="etage" label="Étage" value={b.etage} options={ETAGES} onChange={(x) => maj({ etage: x })} />
          </div>
          <div className="flex items-end gap-2">
            <Select id="statut" label="Vous êtes" value={b.statut} options={STATUTS} onChange={(x) => maj({ statut: x })} />
            <label className="flex h-12 flex-none cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line bg-creme px-4 text-sm font-bold">
              <input type="checkbox" checked={b.ascenseur} onChange={(e) => maj({ ascenseur: e.target.checked })} className="h-[18px] w-[18px] accent-[#121B36]" />
              Ascenseur
            </label>
          </div>
          <button type="button" onClick={() => setEdition(false)} className="flex h-12 items-center justify-center rounded-full border-[1.5px] border-nuit text-[15px] font-bold">Terminer</button>
        </div>
      )}
    </div>
  );
}
