"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/cs/icons";
import { BackButton, ExempleTag, Header, Pill, Screen, SectionTitle, Signal } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import type { Occupant } from "@/lib/domaine";
import { clientNavigateur } from "@/lib/supabase/client";

import { supprimerOccupant } from "../actions-serveur";

const DEPLACEMENT = ["sans gêne", "prudent", "avec une canne", "avec un déambulateur", "en fauteuil"];
const ETAT_PIECE: Record<string, string> = { terminee: "analysée", en_cours: "analyse en cours", echec: "à refilmer", en_attente: "pas encore analysée" };

/**
 * Compte et profil (reprise de la mise à jour de Hoang-Kim, 19/11) : d'ici, on modifie le profil de
 * l'occupant et du logement, on refilme une pièce et on se déconnecte. Un seul occupant par logement
 * pour l'instant : le profil en trois étapes et plusieurs occupants demandent une migration.
 */
export default function PageCompte() {
  const { logement } = useParcours();
  const router = useRouter();
  const base = `/logement/${logement.id}`;
  const o = logement.occupant;
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (logement.exemple) return;
    void clientNavigateur()?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [logement.exemple]);

  const deconnecter = async () => {
    await clientNavigateur()?.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const occupants: Occupant[] = logement.occupants?.length ? logement.occupants : [o];
  const particularites = (x: Occupant) => [x.vue_reduite && "vue réduite", x.audition_reduite && "audition réduite", x.troubles_memoire && "troubles de la mémoire"].filter(Boolean) as string[];
  const [envoi, setEnvoi] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);
  const retirer = async (id: string) => {
    setEnvoi(true);
    setAlerte(null);
    const r = await supprimerOccupant(logement.id, id);
    setEnvoi(false);
    if (r.ok) router.refresh();
    else setAlerte(r.message ?? "Occupant non retiré.");
  };

  return (
    <Screen nav="accueil" className="gap-3">
      <Header left={<BackButton href={`${base}/plan`} />} title="Compte et profil" />
      {logement.exemple && <ExempleTag />}

      <section className="flex flex-col gap-1.5 rounded-card bg-pervenche px-5 py-[18px]">
        <h1 className="text-[21px] leading-7 font-extrabold">Logement de {o.libelle}</h1>
        <p className="text-sm text-ink-soft">{[logement.type, logement.etage, logement.statut].filter(Boolean).join(" · ") || "Type de logement à préciser"}</p>
        {email && <p className="text-[13px] text-ink-soft">Compte : {email}</p>}
      </section>

      <SectionTitle aside={`${occupants.length} personne${occupants.length > 1 ? "s" : ""}`}>Occupants</SectionTitle>
      {occupants.map((x, i) => (
        <div key={x.id ?? i} className="flex flex-col gap-2 rounded-[26px] bg-white px-4 py-3.5 text-sm">
          <p><b>{x.libelle}</b>{x.age ? `, ${x.age} ans` : ""}</p>
          <p className="text-ink-soft">Se déplace {DEPLACEMENT[x.deplacement] ?? "sans gêne"}{particularites(x).length ? ` · ${particularites(x).join(", ")}` : ""}</p>
          <p className="text-xs text-ink-muted">{x.consentement_art9_le ? "Consentement donné pour ces informations de mobilité." : "Consentement à confirmer dans le profil."}</p>
          <div className="flex gap-2">
            <Pill href={`${base}/profil?depuis=compte${x.id && i > 0 ? `&occupant=${x.id}` : ""}`} variant="contour"><Icon name="edit" size={18} />Modifier</Pill>
            {x.id && occupants.length > 1 && i > 0 && (
              <Pill onClick={() => void retirer(x.id!)} variant="blanc" disabled={envoi}><Icon name="trash" size={18} />Retirer</Pill>
            )}
          </div>
        </div>
      ))}
      {!logement.exemple && <Pill href={`${base}/profil?depuis=compte&occupant=nouveau`} variant="contour"><Icon name="plus" size={18} />Ajouter un occupant</Pill>}
      {alerte && <p role="alert" className="rounded-xl2 bg-attention-bg px-3.5 py-3 text-[13px] font-semibold text-attention-text">{alerte}</p>}
      <p className="text-xs text-ink-muted">Avec plusieurs occupants, la règle qui protège la personne la plus vulnérable s&apos;applique.</p>

      <SectionTitle aside={`${logement.pieces.length} pièce${logement.pieces.length > 1 ? "s" : ""}`}>Vidéos du logement</SectionTitle>
      <ul className="flex flex-col gap-2">
        {logement.pieces.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-[26px] bg-white px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[15px]">{p.nom}</b>
              <span className="text-xs text-ink-muted">{ETAT_PIECE[p.analyse] ?? p.analyse}</span>
            </span>
            {p.analyse === "echec" && <Signal kind="attention">À refaire</Signal>}
          </li>
        ))}
        {logement.pieces.length === 0 && <li className="rounded-[26px] bg-white px-4 py-3 text-sm text-ink-muted">Aucune pièce filmée pour l&apos;instant.</li>}
      </ul>
      <Pill href={`${base}/capture`} variant="contour"><Icon name="camera" size={18} />Filmer ou refilmer une pièce</Pill>
      <p className="text-xs text-ink-muted">Refilmer une pièce remplace ses anciens points. Ceux dont vous avez confirmé la cote sont conservés.</p>

      {!logement.exemple && (
        <div className="mt-2">
          <Pill onClick={() => void deconnecter()} variant="blanc">Se déconnecter</Pill>
        </div>
      )}
    </Screen>
  );
}
