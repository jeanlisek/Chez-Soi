"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Cursor, Icon, Triangle } from "@/components/cs/icons";
import { Chip, Pill, RoundButton, Screen } from "@/components/cs/ui";
import { useParcours } from "@/lib/demo/etat";
import { envoyerFichier } from "@/lib/envoi";
import { reveillerVision } from "@/lib/reveil";

/** Consignes par pièce (maquette de Hoang-Kim). */
const PIECES_CAPTURE = [
  { nom: "Entrée", consigne: "la porte, la serrure, les deux côtés du seuil." },
  { nom: "Couloir", consigne: "le sol sur toute la longueur et les interrupteurs." },
  { nom: "Salon", consigne: "les fenêtres en entier, le sol et les tapis." },
  { nom: "Cuisine", consigne: "le sol, les plaques et la fenêtre." },
  { nom: "Salle de bain", consigne: "le sol, la baignoire et les murs autour." },
  { nom: "Chambre", consigne: "le passage du lit à la porte, les lampes." },
];
const TAILLE_MAX_MO = 50;

/**
 * Écran 4 · Capture : une vidéo par pièce, environ 30 s en 720p, 50 Mo au plus (limite du bucket
 * et du Space, issue #10). Sur téléphone, le bouton ouvre la caméra ; la vidéo part ensuite dans le
 * bucket privé `videos` par une URL signée, puis n8n lance l'analyse. Logement exemple : rien n'est envoyé.
 */
export default function PageCapture() {
  const router = useRouter();
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;

  // Le Space vision démarre pendant que l'utilisateur prépare ou filme sa visite.
  useEffect(() => reveillerVision(logement.id, logement.exemple), [logement.id, logement.exemple]);
  const filmees = logement.exemple ? logement.pieces.filter((p) => p.video) : logement.pieces;
  const [etape, setEtape] = useState<"liste" | "choix" | "filmer">("liste");
  const [piece, setPiece] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const [tropLourde, setTropLourde] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);

  const restantes = PIECES_CAPTURE.filter((p) => !filmees.some((f) => f.nom === p.nom));
  const consigne = PIECES_CAPTURE.find((p) => p.nom === piece)?.consigne;

  const choisir = (nom: string) => {
    setPiece(nom);
    setTropLourde(false);
    setEtape("filmer");
  };

  async function traiter(nom: string, f: File | undefined) {
    if (!f) return;
    const mo = f.size / 1_048_576;
    if (mo > TAILLE_MAX_MO) {
      setTropLourde(true);
      setMessage(`Vidéo trop lourde (${Math.round(mo)} Mo, ${TAILLE_MAX_MO} Mo au plus) : filmez à nouveau en 30 secondes environ, en 720p.`);
      return;
    }
    setTropLourde(false);
    setEtape("liste");
    setPiece(undefined);
    if (logement.exemple) {
      setMessage("Logement exemple : la vidéo n'est pas envoyée. Créez votre compte pour analyser votre logement.");
      return;
    }
    setEnvoiEnCours(nom);
    setMessage(`${nom} : envoi de la vidéo…`);
    const r = await envoyerFichier({ logementId: logement.id, type: "video", fichier: f, piece: nom });
    setEnvoiEnCours(null);
    setMessage(r.ok ? `${nom} : ${r.resultat.message}` : r.message);
    if (r.ok) router.refresh();
  }

  const detail = (p: (typeof filmees)[number]) =>
    p.video
      ? `0:${String(p.video.duree_s).padStart(2, "0")} · ${p.video.resolution} · ${p.video.taille_mo} Mo`
      : envoiEnCours === p.nom
        ? "envoi…"
        : p.analyse === "terminee"
          ? "analysée"
          : p.analyse === "echec"
            ? "analyse en échec, refilmez"
            : "vidéo reçue";

  /* ---------- Étape 2 : filmer la pièce choisie ---------- */
  if (etape === "filmer" && piece) {
    return (
      <Screen bg="nuit" className="gap-3">
        <div className="flex items-center justify-between">
          <RoundButton icon="back" label="Revenir à la liste des pièces" onClick={() => setEtape("liste")} variant="sombre" />
          <span className="flex items-center gap-1.5 rounded-full bg-nuit-3 px-3.5 py-2.5 text-[13px] font-bold">
            <span className="h-[9px] w-[9px] rounded-full bg-[#6B7390]" />
            0:30 conseillées
          </span>
        </div>

        <div>
          <p className="text-xs font-bold tracking-[0.06em] text-pervenche uppercase">Vous filmez</p>
          <h1 className="text-[30px] leading-9 font-extrabold" aria-live="polite">{piece}</h1>
        </div>

        <p className="rounded-xl2 bg-pervenche px-4 py-3 text-[15px] leading-[21px] font-semibold text-nuit">
          Filmez lentement, environ 30 secondes, en faisant le tour de la pièce.
        </p>

        <div className="relative min-h-[240px] flex-1 overflow-hidden rounded-card bg-nuit-2">
          <div className="absolute inset-x-0 bottom-0 h-[110px] bg-[#24315A]" />
          <span className="absolute top-5 left-5 rounded-full bg-nuit-3 px-3 py-2 text-[13px] font-semibold">Appuyez sur le bouton pour filmer</span>
          <span className="absolute right-5 bottom-5 rounded-full bg-nuit-3 px-3 py-2 text-xs font-semibold text-pervenche-soft">720p · 50 Mo max</span>
          {consigne && <span className="absolute bottom-5 left-5 max-w-[60%] text-xs leading-4 text-pervenche-soft">À montrer : {consigne}</span>}
        </div>

        {tropLourde ? (
          <div role="alert" className="flex items-center gap-3 rounded-[22px] bg-attention-solid px-4 py-3.5 text-attention-on">
            <Triangle size={24} fill="#3B2600" mark="#E9A21B" />
            <span className="text-[15px] leading-5 font-bold">Vidéo trop lourde, filmez à nouveau en 30 secondes environ.</span>
          </div>
        ) : (
          <p className="text-center text-xs text-pervenche-soft">Posez une feuille A4 au sol : elle sert d&apos;étalon pour les cotes.</p>
        )}

        <div className="flex items-center justify-center gap-6">
          <span className="w-14" />
          <label
            aria-label="Filmer la pièce"
            className="flex h-[84px] w-[84px] cursor-pointer items-center justify-center rounded-full border-[5px] border-pervenche bg-white"
          >
            <span className="h-9 w-9 rounded-full bg-[#FF5A5A]" />
            <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => void traiter(piece, e.target.files?.[0])} />
          </label>
          <span className="w-14" />
        </div>
      </Screen>
    );
  }

  /* ---------- Étape 1 : pièces filmées + choix d'une pièce ---------- */
  return (
    <Screen bg="nuit" className="gap-4">
      <div className="flex items-center justify-between">
        <RoundButton icon="close" label="Quitter la visite" href={`${base}/contrat`} variant="sombre" />
        {etat.parcours === "A" && logement.exemple && (
          <span className="flex items-center gap-2 rounded-full bg-nuit-3 px-3.5 py-2.5 text-xs font-semibold text-pervenche-soft">
            <Cursor size={12} className="text-pervenche" />
            L&apos;agent cherche les CG
          </span>
        )}
      </div>

      <div>
        <p className="text-xs font-bold tracking-[0.06em] text-pervenche uppercase">Visite du logement</p>
        <h1 className="text-[28px] leading-9 font-extrabold">Une vidéo par pièce</h1>
        <p className="mt-1 text-sm text-pervenche-soft">Choisissez la pièce, puis filmez-la environ 30 secondes.</p>
      </div>

      <section aria-label="Pièces filmées" className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.06em] text-pervenche-soft uppercase">Déjà filmées · {filmees.length}</p>
        {filmees.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-[22px] bg-nuit-2 px-4 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-succes-solid text-white">
              <Icon name="check" size={18} />
            </span>
            <span className="flex flex-1 flex-col">
              <b className="text-[15px]">{p.nom}</b>
              <span className="text-xs text-pervenche-soft">{detail(p)}</span>
            </span>
            <button type="button" onClick={() => choisir(p.nom)} className="h-9 rounded-full bg-nuit-3 px-3.5 text-xs font-bold">
              Refilmer
            </button>
          </div>
        ))}
      </section>

      {etape === "choix" ? (
        <section aria-label="Choisir la pièce" className="flex flex-col gap-2.5 rounded-[26px] bg-nuit-2 p-4">
          <b className="text-[15px]">Quelle pièce allez-vous filmer ?</b>
          <div className="flex flex-wrap gap-2">
            {restantes.map((p) => (
              <Chip key={p.nom} dark onClick={() => choisir(p.nom)}>
                {p.nom}
              </Chip>
            ))}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setEtape("choix")}
          className="flex h-14 items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-pervenche text-[15px] font-bold text-pervenche"
        >
          <Icon name="plus" size={18} />
          Ajouter une pièce
        </button>
      )}

      {message && (
        <p aria-live="polite" className="rounded-[22px] bg-pervenche-soft px-4 py-3 text-sm font-semibold text-nuit">
          {message}
        </p>
      )}
      <p className="text-xs leading-4 text-pervenche-soft">Rien ne quitte votre téléphone sans votre accord.</p>

      <div className="mt-auto">
        <Pill href={`${base}/analyse`} variant="blanc" disabled={filmees.length === 0 || envoiEnCours !== null}>
          {filmees.length === 0 ? "Filmez au moins une pièce" : `Terminer la visite · ${filmees.length} pièce${filmees.length > 1 ? "s" : ""}`}
        </Pill>
      </div>
    </Screen>
  );
}
