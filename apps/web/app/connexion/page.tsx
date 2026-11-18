"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";

import { LogoMaison } from "@/components/chez-soi/illustrations";
import { Bouton, Corps, Ecran, EnTete } from "@/components/chez-soi/ui";
import { clientNavigateur } from "@/lib/supabase/client";

/** Connexion : Google (OAuth Supabase) ou lien magique par e-mail. Aucun mot de passe. */
export default function PageConnexion() {
  const supabase = clientNavigateur();
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye" | "erreur">("saisie");
  const [message, setMessage] = useState<string | null>(null);
  const retour = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  if (!supabase)
    return (
      <Ecran>
        <EnTete titre="Connexion" retour="/" />
        <Corps className="items-center justify-center text-center">
          <LogoMaison className="size-16" />
          <h1 className="text-2xl font-extrabold">Votre compte arrive très vite</h1>
          <p className="text-encre-douce">
            La connexion est en cours d&apos;installation. En attendant, parcourez le logement exemple de Marc et Jeanne.
          </p>
          <Bouton href="/logement/exemple/profil">Voir le logement exemple</Bouton>
        </Corps>
      </Ecran>
    );

  return (
    <Ecran>
      <EnTete titre="Connexion" retour="/" />
      <Corps className="justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <LogoMaison className="size-16" />
          <h1 className="text-2xl font-extrabold">Bienvenue chez vous</h1>
          <p className="text-encre-douce">Sans mot de passe : Google, ou un lien reçu par e-mail.</p>
        </div>

        <Bouton
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: retour },
            });
            if (error) {
              setEtat("erreur");
              setMessage("La connexion Google n'est pas encore activée. Utilisez le lien par e-mail.");
            }
          }}
        >
          Continuer avec Google
        </Bouton>

        <div className="flex items-center gap-3 text-sm text-encre-douce">
          <span className="h-px flex-1 bg-gris-ligne" /> ou <span className="h-px flex-1 bg-gris-ligne" />
        </div>

        {etat === "envoye" ? (
          <div className="rounded-3xl bg-vert-clair p-4 text-center">
            <Mail className="mx-auto mb-2 size-6 text-vert" />
            <p className="font-bold">Lien envoyé à {email}</p>
            <p className="text-sm text-encre-douce">Ouvrez-le depuis ce téléphone pour continuer.</p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setEtat("envoi");
              const { error } = await supabase.auth.signInWithOtp({
                email: email.trim(),
                options: { emailRedirectTo: retour },
              });
              if (error) {
                setEtat("erreur");
                setMessage("L'envoi du lien a échoué. Réessayez dans une minute.");
              } else setEtat("envoye");
            }}
          >
            <label className="sr-only" htmlFor="email">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              className="h-14 rounded-full border border-gris-ligne bg-white px-5 outline-none focus:border-encre"
            />
            <Bouton type="submit" variante="contour" disabled={etat === "envoi"}>
              {etat === "envoi" ? "Envoi…" : "Recevoir un lien par e-mail"}
            </Bouton>
          </form>
        )}
        {message && <p className="rounded-2xl bg-ambre-clair p-3 text-sm">{message}</p>}
        <Link href="/logement/exemple/profil" className="text-center font-bold underline underline-offset-4">
          Voir d&apos;abord un logement exemple
        </Link>
      </Corps>
    </Ecran>
  );
}
