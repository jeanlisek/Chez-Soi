"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Bouton, BoutonRond, Corps, Ecran, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";

const PIECES_PROPOSEES = ["Entrée", "Couloir", "Salon", "Cuisine", "Salle de bain", "Chambre"];
const TAILLE_MAX_MO = 50;

/**
 * Écran 4 · Capture : une vidéo par pièce, environ 30 s en 720p, 50 Mo au plus
 * (limite du bucket et du Space). Logement exemple : les vidéos sont déjà filmées.
 */
export default function PageCapture() {
  const { logement } = useParcours();
  const base = `/logement/${logement.id}`;
  const filmees = logement.pieces.filter((p) => p.video);
  const [ajout, setAjout] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Ecran ton="encre">
      <header className="px-5 pt-5">
        <BoutonRond href={`${base}/contrat`} label="Fermer" className="border-white/10 bg-white/10 text-white">
          <X className="size-5" />
        </BoutonRond>
      </header>
      <Corps className="pt-5">
        <div>
          <p className="text-xs font-bold tracking-wider text-lavande uppercase">Visite du logement</p>
          <h1 className="text-3xl font-extrabold">Une vidéo par pièce</h1>
          <p className="mt-1 text-white/75">Choisissez la pièce, puis filmez-la environ 30 secondes.</p>
        </div>

        <p className="text-xs font-bold tracking-wider uppercase">Déjà filmées · {filmees.length}</p>
        <ul className="flex flex-col gap-2">
          {filmees.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
              <span className="grid size-9 place-items-center rounded-full bg-vert">
                <Check className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-bold">{p.nom}</span>
                <span className="text-sm text-white/70">
                  0:{String(p.video!.duree_s).padStart(2, "0")} · {p.video!.resolution} · {p.video!.taille_mo} Mo
                </span>
              </span>
              <label className="cursor-pointer rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
                Refilmer
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const mo = f.size / 1_048_576;
                    setMessage(
                      mo > TAILLE_MAX_MO
                        ? `Vidéo trop lourde (${Math.round(mo)} Mo, ${TAILLE_MAX_MO} Mo au plus) : environ 30 secondes en 720p.`
                        : logement.exemple
                          ? "Logement exemple : la vidéo n'est pas envoyée. Créez votre compte pour analyser votre logement."
                          : `${p.nom} : vidéo prête à l'envoi.`,
                    );
                  }}
                />
              </label>
            </li>
          ))}
        </ul>

        {ajout ? (
          <div className="flex flex-wrap gap-2">
            {PIECES_PROPOSEES.filter((n) => !filmees.some((p) => p.nom === n)).map((n) => (
              <label key={n} className="cursor-pointer rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
                {n}
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const mo = f.size / 1_048_576;
                    setMessage(
                      mo > TAILLE_MAX_MO
                        ? `Vidéo trop lourde (${Math.round(mo)} Mo, ${TAILLE_MAX_MO} Mo au plus) : une vidéo par pièce, environ 30 secondes en 720p.`
                        : logement.exemple
                          ? "Logement exemple : la vidéo n'est pas envoyée. Créez votre compte pour analyser votre logement."
                          : `${n} : vidéo prête à l'envoi.`,
                    );
                  }}
                />
              </label>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAjout(true)}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lavande font-bold text-lavande"
          >
            <Plus className="size-5" /> Ajouter une pièce
          </button>
        )}

        {message && <p className="rounded-2xl bg-ambre-clair p-3 text-sm font-medium text-encre">{message}</p>}
        <p className="text-sm text-white/60">
          Posez une feuille A4 au sol : elle sert d&apos;étalon pour les cotes. Rien ne quitte votre téléphone sans
          votre accord.
        </p>
      </Corps>
      <Pied>
        <Bouton href={`${base}/analyse`} variante="blanc">
          Terminer la visite · {filmees.length} pièces
        </Bouton>
        <Link href={`${base}/analyse`} className="sr-only">
          Analyse
        </Link>
      </Pied>
    </Ecran>
  );
}
