"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/cs/icons";
import { InfosDeBase, LogementEditor, OccupantsEditor } from "@/components/cs/profil";
import { ActionBar, ExempleTag, Header, Illus, Pill, Screen, SectionTitle, cx, useToast } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { basesCompletes, brouillonDepuis, logementComplet, occupantComplet, versEnregistrement, type Brouillon } from "@/lib/profil";
import { clientNavigateur } from "@/lib/supabase/client";

import { enregistrerProfilComplet } from "../actions-serveur";

const ETAT_PIECE: Record<string, string> = { terminee: "", en_cours: "analyse en cours", echec: "à refilmer", en_attente: "en attente" };

/**
 * Onglet Profil (maquette de Hoang-Kim) : un compte = un logement. On modifie les infos de base, les
 * habitants et le logement sur place, puis on enregistre. Les vidéos se changent depuis la visite.
 */
export default function PageCompte() {
  const { logement } = useParcours();
  const router = useRouter();
  const toast = useToast();
  const base = `/logement/${logement.id}`;

  const initial = useMemo(() => brouillonDepuis(logement), [logement]);
  const [b, setB] = useState<Brouillon>(initial);
  useEffect(() => setB(initial), [initial]);
  const maj = (p: Partial<Brouillon>) => setB((x) => ({ ...x, ...p }));
  const modifie = JSON.stringify(b) !== JSON.stringify(initial);
  const complet = basesCompletes(b) && b.occupants.every(occupantComplet) && logementComplet(b);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [compte, setCompte] = useState<{ nom: string; email: string; methode: string } | null>(null);
  useEffect(() => {
    if (logement.exemple) return;
    void clientNavigateur()
      ?.auth.getUser()
      .then(({ data }) => {
        const u = data.user;
        if (!u) return;
        const fournisseur = (u.app_metadata?.provider as string | undefined) ?? "email";
        setCompte({
          nom: (u.user_metadata?.full_name as string | undefined) ?? logement.aidant,
          email: u.email ?? "",
          methode: fournisseur === "google" ? "Connecté avec Google" : "Connecté par lien e-mail",
        });
      });
  }, [logement.exemple, logement.aidant]);
  const nomCompte = compte?.nom ?? logement.aidant;

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const r = await enregistrerProfilComplet(versEnregistrement(logement.id, b));
    setEnvoi(false);
    if (!r.ok) return setErreur(r.message ?? "Profil non enregistré.");
    toast.show("Profil enregistré, plan recalculé");
    router.refresh();
  };

  const deconnecter = async () => {
    await clientNavigateur()?.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const prenom = b.occupants[0]?.prenom || logement.occupant.libelle;
  const n = b.occupants.length;
  const filmees = logement.pieces;
  const sansDiagnostic = !logement.exemple && !filmees.some((p) => p.analyse === "terminee");
  const accordLe = initial.accordLe ? new Date(initial.accordLe).toLocaleDateString("fr-FR") : null;

  return (
    <Screen nav="profil" className="gap-3.5">
      <Header title="Profil" />
      {logement.exemple && <ExempleTag />}

      <section className="flex items-center gap-3.5 rounded-card bg-nuit px-5 py-4 text-white">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-pervenche text-xl font-extrabold text-nuit">{nomCompte.charAt(0).toUpperCase()}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[17px]">{nomCompte}</b>
          {compte?.email && <span className="truncate text-[13px] text-pervenche-soft">{compte.email}</span>}
          <span className="text-xs text-pervenche-soft">{logement.exemple ? "Compte de démonstration" : (compte?.methode ?? "Connecté")} · aidant</span>
        </span>
      </section>

      {sansDiagnostic && (
        <section className="anim-in relative flex min-h-[124px] flex-col justify-center gap-2 overflow-hidden rounded-card bg-pervenche py-4 pr-[120px] pl-5">
          <b className="text-[17px] leading-[22px]">Logement à filmer</b>
          <span className="text-[13px] leading-[18px] text-ink-soft">Une vidéo par pièce suffit pour lancer le diagnostic.</span>
          <Link href={`${base}/capture`} className="flex h-10 items-center self-start rounded-full bg-nuit px-4 text-sm font-bold text-white">Filmer le logement</Link>
          <Illus name="appareil" width={92} className="absolute right-4 bottom-3" />
        </section>
      )}

      <SectionTitle>Logement de {prenom}</SectionTitle>
      <InfosDeBase b={b} maj={maj} />

      <SectionTitle aside={`${n} personne${n > 1 ? "s" : ""}`}>Les habitants</SectionTitle>
      <OccupantsEditor key={n} b={b} maj={maj} ouvertParDefaut={b.occupants.some((o) => !occupantComplet(o))} />
      <p className="-mt-1.5 text-xs leading-[17px] text-ink-muted">Avec plusieurs habitants, la règle qui protège la personne la plus vulnérable s&apos;applique.</p>

      <SectionTitle>Le logement</SectionTitle>
      <LogementEditor b={b} maj={maj} />

      <SectionTitle aside={`${filmees.length} pièce${filmees.length > 1 ? "s" : ""}`}>Les vidéos</SectionTitle>
      <section className="flex flex-col gap-3 rounded-xl2 bg-white px-4 py-3.5">
        {filmees.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filmees.map((p) => (
              <span key={p.id} className={cx("rounded-full px-2.5 py-1 text-xs font-bold", p.analyse === "echec" ? "bg-attention-bg text-attention-text" : "bg-pervenche-soft text-cobalt")}>
                {p.nom}{ETAT_PIECE[p.analyse] ? ` · ${ETAT_PIECE[p.analyse]}` : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Aucune pièce filmée pour l&apos;instant.</p>
        )}
        <p className="text-xs leading-[17px] text-ink-muted">Une pièce a changé ? Refilmez-la ou importez une autre vidéo. Les points dont vous avez confirmé la cote sont gardés.</p>
        <Pill href={`${base}/capture`} variant="contour"><Icon name="camera" size={18} />Changer les vidéos</Pill>
      </section>

      <section className="flex items-center gap-3 rounded-xl2 bg-white px-4 py-3.5">
        <span className="flex flex-1 flex-col gap-0.5">
          <b className="text-sm">Accord des habitants</b>
          <span className="text-xs leading-[17px] text-ink-muted">{accordLe ? `Donné le ${accordLe}. Données de santé, article 9 du RGPD.` : "À donner à la fin du profil."}</span>
        </span>
        <Icon name={accordLe ? "check" : "lock"} size={20} className="text-cobalt" />
      </section>

      {!logement.exemple && (
        <button type="button" onClick={() => void deconnecter()} className="flex h-10 items-center justify-center gap-1.5 text-sm font-bold text-ink-muted">
          <Icon name="back" size={16} />Se déconnecter
        </button>
      )}

      {!logement.exemple && (modifie || erreur) && (
        <ActionBar withNav>
          {erreur && <p role="alert" className="rounded-[20px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text">{erreur}</p>}
          <Pill onClick={() => void enregistrer()} disabled={!complet || envoi}>
            {envoi ? "Enregistrement…" : complet ? "Enregistrer les modifications" : "Profil à compléter"}
          </Pill>
        </ActionBar>
      )}
      {toast.node}
    </Screen>
  );
}
