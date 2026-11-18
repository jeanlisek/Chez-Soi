"use client";

import { useEffect, useState } from "react";
import { Bell, MousePointer2 } from "lucide-react";

import { MascotteEtoile } from "@/components/chez-soi/illustrations";
import { Bouton, BoutonRond, Corps, Ecran, EnTete, Pied } from "@/components/chez-soi/ui";
import { useParcours } from "@/lib/demo/etat";
import { clientNavigateur } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Écran 5 · Analyse. Avancement par pièce (une analyse par vidéo, table `analyses`) et, en parcours A,
 * l'agent H qui retrouve les conditions générales de l'assureur (usage 1).
 * Logement exemple : l'avancement est rejoué sur les résultats déjà calculés.
 */
export default function PageAnalyse() {
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;
  const [t, setT] = useState(0);
  const [reels, setReels] = useState<{ piece: string | null; statut: string; erreur: string | null }[] | null>(null);

  useEffect(() => {
    if (!logement.exemple) return;
    const id = window.setInterval(() => setT((v) => Math.min(v + 1, 100)), 120);
    return () => window.clearInterval(id);
  }, [logement.exemple]);

  // Vrai logement : état des analyses lu dans Supabase (RLS), toutes les 5 secondes.
  useEffect(() => {
    if (logement.exemple) return;
    const supabase = clientNavigateur();
    if (!supabase) return;
    let actif = true;
    const lire = async () => {
      const { data } = await supabase
        .from("analyses")
        .select("piece, statut, erreur, created_at")
        .eq("logement_id", logement.id)
        .eq("type", "video")
        .order("created_at", { ascending: false });
      if (actif && data) setReels(data);
    };
    void lire();
    const id = window.setInterval(lire, 5000);
    return () => {
      actif = false;
      window.clearInterval(id);
    };
  }, [logement.exemple, logement.id]);

  const n = logement.pieces.length;
  const parPiece = 100 / Math.max(n, 1);
  const etatReel = (nom: string) => {
    const a = reels?.find((r) => r.piece === nom);
    if (!a) return { etat: "en_attente" as const, libelle: "en attente" };
    if (a.statut === "terminee" || a.statut === "termine") return { etat: "terminee" as const, libelle: "failles et cotes prêtes" };
    if (a.statut === "echec") return { etat: "echec" as const, libelle: a.erreur?.slice(0, 60) ?? "échec, refilmez" };
    if (a.statut === "en_cours") return { etat: "en_cours" as const, libelle: "analyse en cours" };
    return { etat: "en_attente" as const, libelle: "en attente du service" };
  };
  const terminees = logement.exemple
    ? Math.floor(t / parPiece)
    : logement.pieces.filter((p) => etatReel(p.nom).etat === "terminee").length;
  const contrat = etat.parcours === "A" && logement.contrat;

  return (
    <Ecran>
      <EnTete
        titre="Analyse"
        retour={`${base}/capture`}
        droite={
          <BoutonRond label="Notifications">
            <Bell className="size-5" />
          </BoutonRond>
        }
      />
      <Corps>
        <div className="relative rounded-[28px] bg-lavande p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-encre px-3 py-1.5 text-xs font-bold text-white">
              <MousePointer2 className="size-3.5 fill-current" /> Agent · usage 1
            </span>
            <span className="rounded-full border border-dashed border-encre/40 bg-white/60 px-3 py-1 text-xs font-bold">
              Parcours {etat.parcours}
            </span>
          </div>
          <MascotteEtoile className="mx-auto my-3 size-28 animate-[spin_8s_linear_infinite]" />
          <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm">
            {contrat ? (
              <>
                L&apos;agent retrouve les conditions générales <strong>{contrat.assureur} {contrat.reference_cg}</strong> sur
                le site public de l&apos;assureur. Lecture seule, sans connexion.
              </>
            ) : (
              <>
                Sans contrat, le diagnostic s&apos;appuie sur <strong>la loi puis les recommandations</strong>.
              </>
            )}
          </p>
        </div>
        <div className="flex justify-between text-sm text-encre-douce">
          <span>{contrat ? `${contrat.assureur} · ${contrat.formule}` : "Contrat ajoutable plus tard"}</span>
          <span>H Company</span>
        </div>

        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Avancement par pièce</h2>
          <span className="text-sm font-bold text-[#1a3a86]">
            {terminees} sur {n}
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {logement.pieces.map((p, i) => {
            const debut = i * parPiece;
            const reel = logement.exemple ? null : etatReel(p.nom);
            const pct = reel ? (reel.etat === "terminee" ? 100 : reel.etat === "en_cours" ? 50 : 0) : Math.max(0, Math.min(100, ((t - debut) / parPiece) * 100));
            const etatPiece = reel ? reel.etat : pct >= 100 ? "terminee" : pct > 0 ? "en_cours" : "en_attente";
            return (
              <li key={p.id} className="grid grid-cols-[110px_1fr] items-center gap-2">
                <span className="font-bold">{p.nom}</span>
                <span className="relative h-8 overflow-hidden rounded-full bg-gris-ligne/60">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-[width]",
                      etatPiece === "terminee" ? "bg-vert" : "hachures bg-lavande",
                    )}
                    style={{ width: `${etatPiece === "en_attente" ? 0 : Math.max(pct, 18)}%` }}
                  />
                  <span
                    className={cn(
                      "relative flex h-full items-center px-3 text-xs font-bold",
                      etatPiece === "terminee" && "text-white",
                      etatPiece === "echec" && "text-rouge",
                      etatPiece === "en_attente" && "font-medium text-encre-douce",
                    )}
                  >
                    {reel ? reel.libelle : etatPiece === "terminee" ? "failles et cotes prêtes" : etatPiece === "en_cours" ? `cotes ${Math.round(pct)} %` : "en attente"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Corps>
      <Pied>
        <Bouton href={`${base}/plan`} disabled={logement.exemple && terminees < 1}>
          {terminees >= n ? "Voir le plan" : "Voir les premières pièces"}
        </Bouton>
      </Pied>
    </Ecran>
  );
}
