"use client";

import { Suspense, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { ActionBar, BackButton, Header, Illus, Pill, RoundButton, Screen, Signal, useToast } from "@/components/cs/ui";
import { runTermine, useRunAgent } from "@/lib/agent/client";
import { useParcours } from "@/lib/demo/etat";
import { artisansDe } from "@/lib/schemas";

/**
 * Artisans (usage 4, lecture seule). L'agent H cherche jusqu'à trois artisans près de la commune
 * du logement pour des travaux du plan, et rédige un message de devis. Il ne contacte personne :
 * l'utilisateur appelle ou écrit lui-même. La session vient de `?session=` (écran Plan d'action).
 */
function Artisans() {
  const { logement } = useParcours();
  const base = `/logement/${logement.id}`;
  const sessionId = useSearchParams().get("session");
  const suivi = useRunAgent(logement.exemple ? null : sessionId);
  const router = useRouter();
  const toast = useToast();
  const [arret, setArret] = useState(false);

  const termine = runTermine(suivi.etat);
  const run = suivi.etat?.run;
  const sortie = run?.sortie_finale ?? null;
  const artisans = artisansDe(sortie);
  const message = typeof sortie?.message_devis === "string" ? sortie.message_devis.trim() : "";
  const remarque = typeof sortie?.remarque === "string" ? sortie.remarque.trim() : "";
  const metier = typeof sortie?.metier === "string" ? sortie.metier.trim() : "";
  const coupe = Boolean(run?.coupe_circuit);

  const arreter = async () => {
    if (!sessionId) return;
    setArret(true);
    const r = await fetch("/api/agent/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) }).catch(() => null);
    setArret(false);
    if (!r?.ok) return toast.show("L'agent n'a pas pu être arrêté, réessayez");
    toast.show("Agent arrêté, personne n'a été contacté");
    router.push(`${base}/actions`);
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.show("Message copié");
    } catch {
      toast.show("Copie impossible : sélectionnez le texte");
    }
  };

  return (
    <Screen nav="agent" className="gap-3">
      <Header left={<BackButton href={`${base}/actions`} />} title="Trouver un artisan" />

      {logement.exemple || !sessionId ? (
        <section className="flex flex-col items-center gap-3 rounded-card bg-pervenche p-6 text-center">
          <Illus name="navigateur" width={110} />
          <b className="text-lg">Aucune recherche en cours</b>
          <p className="text-sm text-ink-soft">Sur votre logement, lancez la recherche depuis un travail du plan d&apos;action (« Trouver un artisan »).</p>
          <Pill href={`${base}/actions`} variant="blanc">Plan d&apos;action</Pill>
        </section>
      ) : !termine ? (
        <section className="flex flex-col items-center gap-3 rounded-card bg-pervenche p-6 text-center">
          <span className="self-end"><Signal kind="info" icon>En cours</Signal></span>
          <Illus name="navigateur" width={120} className="anim-float" />
          <b className="text-lg">L&apos;agent cherche des artisans près de chez vous</b>
          <p className="text-sm text-ink-soft">Une à trois minutes. Il lit des annuaires et des pages d&apos;artisans ; il ne contacte personne et ne remplit aucun formulaire.</p>
          <RoundButton icon="stop" label="Arrêter l'agent" size={54} onClick={() => void arreter()} />
          {arret && <p className="text-xs text-ink-muted">Arrêt en cours…</p>}
        </section>
      ) : (
        <>
          <p className="text-sm leading-5 text-ink-soft">
            {artisans.length
              ? `${artisans.length} artisan${artisans.length > 1 ? "s" : ""}${metier ? ` (${metier})` : ""}, lus sur leurs pages par l'agent. Vérifiez-les avant d'appeler : personne n'a été contacté.`
              : coupe
                ? "Session coupée : l'agent a ouvert une page non autorisée (connexion, rendez-vous…). Personne n'a été contacté."
                : "L'agent n'a pas trouvé d'artisan sûr pour ces travaux."}
          </p>
          <ul className="flex flex-col gap-3">
            {artisans.map((a) => (
              <li key={a.nom} className="flex flex-col gap-1.5 rounded-[26px] bg-white px-4 py-3.5">
                <b className="text-[15px] leading-5">{a.nom}</b>
                {(a.ville || a.labels) && <span className="text-xs text-ink-muted">{[a.ville, a.labels].filter(Boolean).join(" · ")}</span>}
                {a.pourquoi && <p className="text-sm leading-5">{a.pourquoi}</p>}
                <span className="flex flex-wrap gap-3 text-sm font-bold">
                  {a.telephone && <a href={`tel:${a.telephone.replace(/[^\d+]/g, "")}`} className="text-nuit underline">{a.telephone}</a>}
                  {a.lien && <a href={a.lien} target="_blank" rel="noopener noreferrer nofollow" className="text-nuit underline">Voir la page</a>}
                </span>
              </li>
            ))}
          </ul>
          {message && (
            <section className="flex flex-col gap-2 rounded-[26px] bg-pervenche px-4 py-3.5">
              <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Message de demande de devis</span>
              <p className="text-sm leading-5 whitespace-pre-line">{message}</p>
              <p className="text-xs text-ink-soft">Ajoutez vos coordonnées, puis envoyez-le vous-même.</p>
            </section>
          )}
          {remarque && (
            <section role="status" className="flex flex-col gap-1 rounded-[26px] bg-white px-4 py-3.5">
              <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">Ce que dit l&apos;agent</span>
              <p className="text-sm leading-5">{remarque}</p>
            </section>
          )}
        </>
      )}

      {suivi.erreur && <p role="alert" className="rounded-[20px] bg-attention-bg px-4 py-3 text-sm font-semibold text-attention-text">{suivi.erreur}</p>}

      {termine && message && (
        <ActionBar withNav>
          <Pill onClick={() => void copier()}>Copier le message de devis</Pill>
        </ActionBar>
      )}
      {toast.node}
    </Screen>
  );
}

export default function PageArtisans() {
  return (
    <Suspense fallback={null}>
      <Artisans />
    </Suspense>
  );
}
