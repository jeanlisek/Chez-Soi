import Link from "next/link";

import { MaisonRayonnante, LogoMaison } from "@/components/chez-soi/illustrations";
import { Bouton, Ecran } from "@/components/chez-soi/ui";

/** Écran 1 · Inscription. */
export default function Accueil() {
  return (
    <Ecran ton="lavande">
      <header className="flex items-center justify-between px-5 pt-5">
        <span className="grid size-14 place-items-center rounded-full bg-creme">
          <LogoMaison className="size-8" />
        </span>
        <Link
          href="/connexion"
          className="rounded-full bg-lavande-claire px-5 py-3 text-sm font-bold text-[#1a3a86]"
        >
          J&apos;ai un compte
        </Link>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
        <h1 className="mt-6 text-center text-[28px] leading-tight font-normal">
          Repérez les risques de votre logement et <strong className="font-extrabold">laissez l&apos;agent agir</strong>
        </h1>
        <div className="flex flex-1 items-center justify-center py-6">
          <MaisonRayonnante className="w-60 max-w-full" />
        </div>
      </main>

      <footer className="flex flex-col gap-3 px-5 pb-8">
        <Bouton href="/connexion">Continuer avec Google</Bouton>
        <Bouton href="/connexion" variante="contour">
          Recevoir un lien par e-mail
        </Bouton>
        <Link href="/logement/exemple/profil" className="py-2 text-center font-bold underline underline-offset-4">
          Voir d&apos;abord un logement exemple
        </Link>
        <p className="text-center text-xs text-encre-douce">
          L&apos;agent ne paie, n&apos;envoie et ne signe jamais à votre place.
        </p>
      </footer>
    </Ecran>
  );
}
