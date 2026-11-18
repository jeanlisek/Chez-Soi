import Link from "next/link";

import { LogoMaison } from "@/components/chez-soi/illustrations";
import { Bouton, Corps, Ecran, EnTete } from "@/components/chez-soi/ui";

/** Connexion (Google, lien par e-mail). Branchée sur Supabase Auth au lot 2. */
export default function PageConnexion() {
  return (
    <Ecran>
      <EnTete titre="Connexion" retour="/" />
      <Corps className="items-center justify-center text-center">
        <LogoMaison className="size-16" />
        <h1 className="text-2xl font-extrabold">Votre compte arrive très vite</h1>
        <p className="text-encre-douce">
          La connexion par Google ou par lien e-mail est en cours d&apos;installation. En attendant, parcourez le logement
          exemple de Marc et Jeanne.
        </p>
        <Bouton href="/logement/exemple/profil">Voir le logement exemple</Bouton>
        <Link href="/" className="text-sm font-semibold underline">
          Retour à l&apos;accueil
        </Link>
      </Corps>
    </Ecran>
  );
}
