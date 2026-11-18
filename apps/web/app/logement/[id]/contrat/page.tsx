"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";

import { ContratUpload } from "@/components/ContratUpload";
import { Bouton, Carte, Corps, Ecran, EnTete, Etape, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import { envoyerFichier } from "@/lib/envoi";

/** Écran 3 · Contrat (facultatif). Avec contrat : parcours A ; sans : parcours B. */
export default function PageContrat() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Ecran>
      <EnTete titre="Contrat" retour={`${base}/profil`} droite={<Etape n={2} sur={3} />} />
      <Corps>
        <ContratUpload
          occupant={etat.occupant.libelle}
          depose={etat.contratDepose}
          contrat={logement.contrat}
          onDepose={async (fichier) => {
            if (logement.exemple || !fichier) return maj({ contratDepose: true, parcours: "A" });
            setMessage("Envoi du contrat…");
            const r = await envoyerFichier({ logementId: logement.id, type: "contrat", fichier });
            setMessage(r.ok ? r.resultat.message : r.message);
            if (!r.ok) return;
            maj({ contratDepose: true, parcours: "A" });
            if (r.resultat.contrat_id) {
              const lecture = await fetch("/api/contrat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contrat_id: r.resultat.contrat_id }),
              }).catch(() => null);
              const etat = (await lecture?.json().catch(() => null)) as { statut_extraction?: string; obligations_retenues?: number | null } | null;
              if (etat?.statut_extraction === "termine")
                setMessage(`Contrat lu : ${etat.obligations_retenues ?? "des"} clauses retenues, chacune avec sa page.`);
              else if (etat?.statut_extraction === "echec") setMessage("La lecture du contrat a échoué. Le diagnostic s'appuiera sur la loi.");
              else setMessage("Contrat reçu. La lecture des clauses se poursuit pendant la visite.");
            }
          }}
        />
        {message && <p className="rounded-2xl bg-white p-3 text-sm">{message}</p>}
        <Carte className="text-encre-douce">
          Sans contrat, le diagnostic s&apos;appuie sur la loi puis sur les recommandations. Vous pourrez
          l&apos;ajouter plus tard.
        </Carte>
        <p className="flex items-start gap-2 px-1 text-sm text-encre-douce">
          <Lock className="mt-0.5 size-4 shrink-0 text-[#1c2f7a]" />
          Seuls les champs utiles sont extraits, chacun avec sa clause et sa page. Le PDF ne va jamais à
          l&apos;agent.
        </p>
      </Corps>
      <Pied>
        <Bouton href={`${base}/capture`}>Continuer vers la visite</Bouton>
        <Bouton
          variante="fantome"
          className="h-10"
          onClick={() => {
            maj({ contratDepose: false, parcours: "B" });
            router.push(`${base}/capture`);
          }}
        >
          Passer, je n&apos;ai pas le contrat
        </Bouton>
      </Pied>
    </Ecran>
  );
}
