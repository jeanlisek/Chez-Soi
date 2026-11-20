"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/cs/icons";
import { AgentTag, BackButton, Header, Illus, Note, Pill, RoundButton, Ring, Screen, Signal } from "@/components/cs/ui";
import { runTermine, useRunAgent } from "@/lib/agent/client";
import { useParcours } from "@/lib/demo/etat";
import { envoyerFichier } from "@/lib/envoi";
import { reveillerVision } from "@/lib/reveil";

/**
 * Écran 3 · Contrat (facultatif). Avec contrat : parcours A ; sans : parcours B.
 * Vrai logement : le fichier part dans le bucket privé `contrats` (URL signée), puis `/api/contrat`
 * lance l'extraction (clause et page obligatoires). Le PDF ne va jamais à l'agent.
 */
export default function PageContrat() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;

  // Le Space vision démarre pendant que l'utilisateur prépare ou filme sa visite.
  useEffect(() => reveillerVision(logement.id, logement.exemple), [logement.id, logement.exemple]);
  const entree = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const depose = etat.contratDepose;

  // Usage 1 (vrai logement) : la recherche des conditions générales est une vraie session H, lancée
  // par l'utilisateur. L'écran n'annonce « l'agent cherche » que pendant qu'elle tourne.
  const [sessionCg, setSessionCg] = useState<string | null>(null);
  const [lancementCg, setLancementCg] = useState(false);
  const [alerteCg, setAlerteCg] = useState<string | null>(null);
  const suiviCg = useRunAgent(sessionCg);
  const finCg = runTermine(suiviCg.etat);
  const sortieCg = suiviCg.etat?.run.sortie_finale as { trouve?: boolean; titre?: string; reference_trouvee?: string; raison?: string } | null | undefined;
  const chercherCg = async () => {
    setLancementCg(true);
    setAlerteCg(null);
    const r = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logement_id: logement.id, usage: 1 }),
    }).catch(() => null);
    const corps = r ? ((await r.json().catch(() => null)) as { session_id?: string; message?: string } | null) : null;
    setLancementCg(false);
    if (!r || !r.ok || !corps?.session_id) setAlerteCg(corps?.message ?? "La recherche n'a pas pu démarrer.");
    else setSessionCg(corps.session_id);
  };
  const contrat = logement.contrat;
  const prenom = etat.occupant.libelle === "l'occupant" ? "l'occupant" : etat.occupant.libelle;

  const choisir = (accept: string) => {
    if (logement.exemple) return maj({ contratDepose: true, parcours: "A" });
    if (!entree.current) return;
    entree.current.accept = accept;
    entree.current.click();
  };

  const deposer = async (fichier: File) => {
    setNom(fichier.name);
    setEnvoi(true);
    setMessage("Envoi du contrat…");
    const r = await envoyerFichier({ logementId: logement.id, type: "contrat", fichier });
    if (!r.ok) {
      setEnvoi(false);
      return setMessage(r.message);
    }
    maj({ contratDepose: true, parcours: "A" });
    setMessage("Contrat reçu. Lecture des clauses…");
    if (r.resultat.contrat_id) {
      // Le service de lecture peut se réveiller (jusqu'à quelques minutes) : on relance tant qu'il démarre.
      type Lecture = { statut_extraction?: string; obligations_retenues?: number | null };
      let lu: Lecture | null = null as Lecture | null;
      for (let essai = 0; essai < 10; essai++) {
        const lecture = await fetch("/api/contrat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contrat_id: r.resultat.contrat_id }),
        }).catch(() => null);
        lu = (await lecture?.json().catch(() => null)) as Lecture | null;
        if (lu?.statut_extraction === "termine" || lu?.statut_extraction === "echec") break;
        setMessage("Contrat reçu. Le service de lecture démarre, encore un instant…");
        await new Promise((ok) => setTimeout(ok, 20_000));
      }
      if (lu?.statut_extraction === "termine") setMessage(`Contrat lu : ${lu.obligations_retenues ?? "des"} clauses retenues, chacune avec sa page.`);
      else if (lu?.statut_extraction === "echec") setMessage("La lecture du contrat a échoué. Le diagnostic s'appuiera sur la loi.");
      else setMessage("Contrat reçu. La lecture des clauses se poursuit pendant la visite.");
    }
    setEnvoi(false);
  };

  return (
    <Screen className="gap-3.5">
      <Header left={<BackButton href={`${base}/profil`} />} title="Contrat" right={<Ring value={2} total={3} size={48} track="#E3E5EE" />} />

      <section className="flex flex-col gap-3.5 rounded-card bg-lilas p-5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[22px] leading-[27px] font-extrabold">Le contrat d&apos;assurance de {prenom}</h2>
            <p className="text-sm leading-[19px] text-lilas-ink">Ce qu&apos;il exige devient votre priorité n°1, avec la clause et la page.</p>
          </div>
          <span className="flex-none rounded-full bg-white px-2.5 py-1 text-xs font-bold text-lilas-ink">Facultatif</span>
        </div>
        {!depose && (
          <div className="flex justify-center gap-7">
            <span className="flex flex-col items-center gap-1.5">
              <RoundButton icon="camera" label="Prendre le contrat en photo" size={60} onClick={() => choisir("image/*")} />
              <span className="text-[13px] font-bold">Photo</span>
            </span>
            <span className="flex flex-col items-center gap-1.5">
              <RoundButton icon="upload" label="Déposer un PDF" size={60} variant="nuit" onClick={() => choisir("application/pdf")} />
              <span className="text-[13px] font-bold">PDF</span>
            </span>
          </div>
        )}
        <input
          ref={entree}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void deposer(f);
          }}
        />
      </section>

      {depose ? (
        <>
          <section className="flex flex-col gap-2.5 rounded-xl2 bg-white px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-lilas-soft text-[#5A4470]"><Icon name="doc" /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[15px]">{contrat ? `${contrat.assureur} · ${contrat.formule}` : "Conditions particulières"}</b>
                <span className="truncate text-[13px] text-ink-muted">{contrat ? `CG ${contrat.reference_cg}${logement.exemple ? " · conditions particulières fictives" : ""}` : (nom ?? "Contrat déposé")}</span>
              </span>
              {envoi ? <Signal kind="info">Lecture</Signal> : <Signal kind="succes">Reçu</Signal>}
            </div>
            {contrat?.inoccupation && (
              <ul className="flex flex-col gap-1.5 border-t border-[#EFF0F5] pt-2.5 text-sm leading-5">
                <li>Inoccupation : {contrat.inoccupation.duree_max_jours} jours max., p. {contrat.inoccupation.page}</li>
                <li>{contrat.inoccupation.protections.length} protections exigées pendant l&apos;absence</li>
              </ul>
            )}
            {message && <p className="border-t border-[#EFF0F5] pt-2.5 text-sm leading-5" aria-live="polite">{message}</p>}
          </section>
          <section className="relative flex min-h-[120px] flex-col justify-center gap-1.5 rounded-[28px] bg-pervenche py-4 pr-4 pl-[132px]">
            <Illus name="navigateur" width={104} className="absolute top-[22px] left-3.5" />
            {logement.exemple ? (
              <>
                <b className="text-[15px] leading-5">L&apos;agent cherche les conditions générales</b>
                <span className="text-[13px] leading-[18px] text-ink-soft">Sur le site de l&apos;assureur, sans connexion. Il travaille pendant que vous filmez.</span>
              </>
            ) : sessionCg && !finCg ? (
              <>
                <b className="text-[15px] leading-5" aria-live="polite">L&apos;agent cherche les conditions générales…</b>
                <span className="text-[13px] leading-[18px] text-ink-soft">Sur le site de l&apos;assureur, sans connexion. Vous pouvez continuer et filmer pendant ce temps.</span>
              </>
            ) : sessionCg && finCg ? (
              <>
                <b className="text-[15px] leading-5" aria-live="polite">{sortieCg?.trouve ? "Conditions générales retrouvées" : "Conditions générales non retrouvées"}</b>
                <span className="text-[13px] leading-[18px] text-ink-soft">
                  {sortieCg?.trouve
                    ? [sortieCg.titre, sortieCg.reference_trouvee ? `référence lue : ${sortieCg.reference_trouvee}` : null].filter(Boolean).join(" · ") || "Le document est vérifié par Chez Soi avant d'être utilisé."
                    : suiviCg.etat?.run.coupe_circuit
                      ? "Arrêté par sécurité : le site de l'assureur l'envoyait vers une page de connexion. Déposez le PDF des conditions générales vous-même."
                      : sortieCg?.raison || "L'agent n'a pas trouvé le document sur le site de l'assureur."}
                </span>
              </>
            ) : (
              <>
                <b className="text-[15px] leading-5">Retrouver les conditions générales</b>
                <span className="text-[13px] leading-[18px] text-ink-soft">L&apos;agent les cherche sur le site de l&apos;assureur, sans connexion et sans rien envoyer.</span>
                <button type="button" onClick={() => void chercherCg()} disabled={lancementCg} className="mt-1 h-10 self-start rounded-full bg-nuit px-4 text-sm font-bold text-white disabled:opacity-50">
                  {lancementCg ? "Lancement…" : "Lancer la recherche"}
                </button>
              </>
            )}
            {(alerteCg ?? suiviCg.erreur) && <span role="alert" className="text-[13px] font-semibold leading-[18px]">{alerteCg ?? suiviCg.erreur}</span>}
            <AgentTag>Usage 1 · lecture seule</AgentTag>
          </section>
        </>
      ) : (
        <>
          {message && <p role="alert" className="rounded-xl2 bg-attention-bg px-4 py-3.5 text-sm font-semibold text-attention-text">{message}</p>}
          <p className="rounded-xl2 bg-white px-4 py-3.5 text-sm leading-5 text-ink-muted">
            Sans contrat, le diagnostic s&apos;appuie sur la loi puis sur les recommandations. Vous pourrez l&apos;ajouter plus tard.
          </p>
        </>
      )}

      <Note>Seuls les champs utiles sont extraits, chacun avec sa clause et sa page. Le PDF ne va jamais à l&apos;agent.</Note>

      <div className="mt-auto flex flex-col gap-1.5">
        <Pill href={`${base}/capture`} disabled={envoi}>Continuer vers la visite</Pill>
        {!depose && (
          <Link
            href={`${base}/capture`}
            onClick={(e) => {
              e.preventDefault();
              maj({ contratDepose: false, parcours: "B" });
              router.push(`${base}/capture`);
            }}
            className="flex h-10 items-center justify-center text-[15px] font-bold"
          >
            Passer, je n&apos;ai pas le contrat
          </Link>
        )}
      </div>
    </Screen>
  );
}
