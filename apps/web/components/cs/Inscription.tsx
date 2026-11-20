"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Illus, Pill, Screen } from "@/components/cs/ui";
import { clientNavigateur } from "@/lib/supabase/client";
import { BandeauVision } from "@/components/cs/BandeauVision";

/**
 * Écran 1 · Inscription (maquette de Hoang-Kim). Connexion sans mot de passe :
 * Google (OAuth Supabase) ou lien magique par e-mail. Le logement exemple reste ouvert sans compte.
 */
export function Inscription({ erreurInitiale }: { erreurInitiale?: string }) {
  const supabase = clientNavigateur();
  const [email, setEmail] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoye">("saisie");
  const [message, setMessage] = useState<string | null>(erreurInitiale ?? null);
  const retour = () => `${window.location.origin}/auth/callback`;

  const google = async () => {
    if (!supabase) return setMessage("La connexion arrive très vite. En attendant, voyez le logement exemple.");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: retour() } });
    if (error) setMessage("La connexion Google n'est pas disponible pour l'instant. Utilisez le lien par e-mail.");
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (!adresse.includes("@")) return;
    if (!supabase) return setMessage("La connexion arrive très vite. En attendant, voyez le logement exemple.");
    setEtat("envoi");
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ email: adresse.trim(), options: { emailRedirectTo: retour() } });
    if (error) {
      setEtat("saisie");
      setMessage("L'envoi du lien a échoué. Réessayez dans une minute.");
    } else setEtat("envoye");
  };

  return (
    <Screen bg="pervenche" className="gap-5 pt-6">
      <div className="flex items-center justify-between">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-creme" aria-label="Chez Soi">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
        </span>
        <Link href="/mon-logement" className="flex h-[52px] items-center rounded-full bg-pervenche-soft px-5 text-[15px] font-bold text-cobalt">
          J&apos;ai un compte
        </Link>
      </div>

      <h1 className="text-center text-[28px] leading-9 font-medium">
        Repérez les risques de votre logement et <b className="font-extrabold">laissez l&apos;agent agir</b>
      </h1>

      <div className="flex flex-1 items-center justify-center py-2" aria-hidden="true">
        <Illus name="ok" width={250} />
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        {message && <p role="alert" className="rounded-[20px] bg-attention-bg px-4 py-3 text-sm font-semibold text-attention-text">{message}</p>}
        {!email ? (
          <>
            <Pill onClick={google}>Continuer avec Google</Pill>
            <Pill variant="contour" onClick={() => setEmail(true)}>Recevoir un lien par e-mail</Pill>
          </>
        ) : etat === "envoye" ? (
          <div className="flex flex-col gap-2 rounded-[28px] bg-white p-5 text-center">
            <b className="text-lg">Lien envoyé à {adresse}</b>
            <span className="text-sm text-ink-muted">Ouvrez-le depuis ce téléphone. Pas de mot de passe à retenir.</span>
          </div>
        ) : (
          <form onSubmit={envoyer} className="flex flex-col gap-2.5">
            <label htmlFor="mail" className="text-sm font-bold">Votre adresse e-mail</label>
            <input
              id="mail"
              type="email"
              required
              autoComplete="email"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="marc@exemple.fr"
              className="h-[54px] rounded-full bg-white px-5 text-base outline-none focus-visible:ring-2 focus-visible:ring-nuit"
            />
            <Pill type="submit" disabled={etat === "envoi"}>{etat === "envoi" ? "Envoi…" : "Envoyer le lien"}</Pill>
            <button type="button" onClick={() => setEmail(false)} className="h-10 text-sm font-bold">Autre méthode</button>
          </form>
        )}
        <Link href="/logement/exemple/plan" className="flex h-10 items-center justify-center text-[15px] font-bold underline underline-offset-4">
          Voir d&apos;abord un logement exemple
        </Link>
        <BandeauVision />
        <p className="text-center text-xs leading-[17px] text-ink-soft">L&apos;agent ne paie, n&apos;envoie et ne signe jamais à votre place.</p>
      </div>
    </Screen>
  );
}
