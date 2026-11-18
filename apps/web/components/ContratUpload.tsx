"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp } from "lucide-react";

import type { Contrat } from "@/lib/domaine";

/**
 * Dépôt du contrat d'assurance (photo ou PDF). Logement exemple : le contrat fictif est déjà là.
 * Vrai logement : le fichier part dans le bucket privé `contrats` par une URL signée (`/api/upload`),
 * puis `/api/contrat` lance l'extraction (Docling, clause et page obligatoires).
 */
export function ContratUpload({
  occupant,
  depose,
  contrat,
  onDepose,
}: {
  occupant: string;
  depose: boolean;
  contrat: Contrat | null;
  onDepose: (fichier?: File) => void | Promise<void>;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState<string | null>(null);

  return (
    <div className="rounded-[28px] bg-lilas p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl leading-tight font-extrabold">Le contrat d&apos;assurance de {occupant}</h2>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">Facultatif</span>
      </div>
      <p className="mt-2 text-encre-douce">Ce qu&apos;il exige devient votre priorité n°1, avec la clause et la page.</p>

      {depose && !contrat ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/80 p-3">
          <CheckCircle2 className="size-6 shrink-0 text-vert" />
          <p className="text-sm font-bold">Contrat reçu{nom ? ` · ${nom}` : ""}. Lecture des clauses en cours.</p>
        </div>
      ) : depose && contrat ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/80 p-3">
          <CheckCircle2 className="size-6 shrink-0 text-vert" />
          <div className="text-sm">
            <p className="font-bold">
              {contrat.assureur} · {contrat.formule}
            </p>
            <p className="text-encre-douce">
              Conditions générales {contrat.reference_cg}
              {nom ? ` · ${nom}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-center gap-6">
          {[
            { label: "Photo", Icone: Camera, accept: "image/*", fond: "bg-white text-encre" },
            { label: "PDF", Icone: FileUp, accept: "application/pdf", fond: "bg-encre text-white" },
          ].map(({ label, Icone, accept, fond }) => (
            <button
              key={label}
              type="button"
              className="flex flex-col items-center gap-1.5 text-sm font-bold"
              onClick={() => {
                if (entree.current) {
                  entree.current.accept = accept;
                  entree.current.click();
                }
              }}
            >
              <span className={`grid size-16 place-items-center rounded-full ${fond}`}>
                <Icone className="size-6" />
              </span>
              {label}
            </button>
          ))}
          <input
            ref={entree}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setNom(f.name);
                void onDepose(f);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
