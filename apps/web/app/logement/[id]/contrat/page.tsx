"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/cs/icons";
import { AgentTag, BackButton, Header, Illus, Note, Pill, RoundButton, Ring, Screen, Signal } from "@/components/cs/ui";
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
      const lecture = await fetch("/api/contrat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrat_id: r.resultat.contrat_id }),
      }).catch(() => null);
      const lu = (await lecture?.json().catch(() => null)) as { statut_extraction?: string; obligations_retenues?: number | null } | null;
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
                <span className="truncate text-[13px] text-ink-muted">{contrat ? `Conditions générales ${contrat.reference_cg}` : (nom ?? "Contrat déposé")}</span>
              </span>
              {envoi ? <Signal kind="info">Lecture</Signal> : <Signal kind="succes">Reçu</Signal>}
            </div>
            {contrat?.inoccupation && (
              <ul className="flex flex-col gap-1.5 border-t border-[#EFF0F5] pt-2.5 text-sm leading-5">
                <li>Clause d&apos;inoccupation : {contrat.inoccupation.duree_max_jours} jours, p. {contrat.inoccupation.page}</li>
                <li>{contrat.inoccupation.protections.length} protections exigées pendant l&apos;absence</li>
              </ul>
            )}
            {message && <p className="border-t border-[#EFF0F5] pt-2.5 text-sm leading-5" aria-live="polite">{message}</p>}
          </section>
          <section className="relative flex min-h-[120px] flex-col justify-center gap-1.5 rounded-[28px] bg-pervenche py-4 pr-4 pl-[132px]">
            <Illus name="navigateur" width={104} className="absolute top-[22px] left-3.5" />
            <b className="text-[15px] leading-5">L&apos;agent cherche les conditions générales</b>
            <span className="text-[13px] leading-[18px] text-ink-soft">Sur le site de l&apos;assureur, sans connexion. Il travaille pendant que vous filmez.</span>
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
