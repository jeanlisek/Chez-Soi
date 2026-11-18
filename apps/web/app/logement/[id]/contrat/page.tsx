"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { ContratUpload } from "@/components/ContratUpload";
import { Bouton, Carte, Corps, Ecran, EnTete, Etape, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";

/** Écran 3 · Contrat (facultatif). Avec contrat : parcours A ; sans : parcours B. */
export default function PageContrat() {
  const router = useRouter();
  const { logement, etat, maj } = useParcours();
  const base = `/logement/${logement.id}`;

  return (
    <Ecran>
      <EnTete titre="Contrat" retour={`${base}/profil`} droite={<Etape n={2} sur={3} />} />
      <Corps>
        <ContratUpload
          occupant={etat.occupant.libelle}
          depose={etat.contratDepose}
          contrat={logement.contrat}
          onDepose={() => maj({ contratDepose: true, parcours: "A" })}
        />
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
