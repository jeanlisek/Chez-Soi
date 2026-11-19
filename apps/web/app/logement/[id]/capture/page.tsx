"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { CircleInfo, Cursor, Icon, Triangle, type IconName } from "@/components/cs/icons";
import { Chip, Pill, RoundButton, Screen, cx, useToast } from "@/components/cs/ui";
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
/** Durée conseillée (décision #10). La caméra du téléphone ne s'arrête pas seule : au-delà, on prévient. */
const DUREE_CONSEILLEE_S = 30;
const DUREE_COURTE_S = 8;

/** Conseils de prise de vue (maquette de Hoang-Kim, 19/11). */
const CONSEILS: { icon: IconName; texte: string }[] = [
  { icon: "sun", texte: "Allumez les lumières et ouvrez les volets." },
  { icon: "phone", texte: "Téléphone bien droit, à hauteur de poitrine." },
  { icon: "rotate", texte: "Tournez lentement, en partant de la porte." },
  { icon: "eye", texte: "Montrez le sol, puis les murs et les fenêtres." },
  { icon: "sheet", texte: "Posez une feuille A4 au sol : elle sert de règle." },
];

type Revue = { piece: string; fichier: File; src: string; duree: number; mo: number; importee: boolean };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const fmtMo = (mo: number) => `${mo.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

/**
 * Écran 4 · Capture : une vidéo par pièce, environ 30 s, 50 Mo au plus (limite du bucket et du
 * Space, issue #10). Sur téléphone, le bouton ouvre la caméra ; on peut aussi importer une vidéo
 * déjà filmée. La vidéo est relue (durée, taille) avant l'envoi : refaire ou valider. Elle part
 * ensuite dans le bucket privé `videos` par une URL signée, puis n8n lance l'analyse.
 * Logement exemple : rien n'est envoyé.
 */
export default function PageCapture() {
  const router = useRouter();
  const { logement, etat } = useParcours();
  const base = `/logement/${logement.id}`;
  const toast = useToast(true);

  // Le Space vision démarre pendant que l'utilisateur prépare ou filme sa visite.
  useEffect(() => reveillerVision(logement.id, logement.exemple), [logement.id, logement.exemple]);
  const filmees = logement.exemple ? logement.pieces.filter((p) => p.video) : logement.pieces;
  const [etape, setEtape] = useState<"liste" | "choix" | "filmer" | "revoir">("liste");
  const [piece, setPiece] = useState<string>();
  const [revue, setRevue] = useState<Revue>();
  const [message, setMessage] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);
  const [conseils, setConseils] = useState(filmees.length === 0); // ouverts d'office pour une première visite
  const [conseilsCam, setConseilsCam] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);

  // L'aperçu local est libéré quand on quitte la relecture.
  useEffect(() => {
    const src = revue?.src;
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [revue?.src]);

  const restantes = PIECES_CAPTURE.filter((p) => !filmees.some((f) => f.nom === p.nom));
  const consigne = PIECES_CAPTURE.find((p) => p.nom === piece)?.consigne;

  const choisir = (nom: string) => {
    setPiece(nom);
    setRevue(undefined);
    setConseilsCam(false);
    setEtape("filmer");
  };

  /** Vidéo filmée ou importée : on lit sa durée et sa taille avant de proposer l'envoi. */
  const videoChoisie = (importee: boolean) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !piece) return;
    if (!f.type.startsWith("video/")) {
      setMessage("Ce fichier n'est pas une vidéo.");
      return;
    }
    setMessage(null);
    const src = URL.createObjectURL(f);
    const mo = Math.max(0.1, Math.round(f.size / 104_857.6) / 10);
    const ouvrir = (duree: number) => {
      setRevue({ piece, fichier: f, src, mo, duree, importee });
      setEtape("revoir");
    };
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => ouvrir(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => ouvrir(0);
    v.src = src;
  };

  async function valider() {
    if (!revue) return;
    const { piece: nom, fichier } = revue;
    const remplace = filmees.some((p) => p.nom === nom);
    setRevue(undefined);
    setPiece(undefined);
    setEtape("liste");
    if (logement.exemple) {
      setMessage("Logement exemple : la vidéo n'est pas envoyée. Créez votre compte pour analyser votre logement.");
      return;
    }
    setEnvoiEnCours(nom);
    setMessage(`${nom} : envoi de la vidéo…`);
    const r = await envoyerFichier({ logementId: logement.id, type: "video", fichier, piece: nom });
    setEnvoiEnCours(null);
    setMessage(r.ok ? `${nom} : ${r.resultat.message}` : r.message);
    if (r.ok) {
      toast.show(`Vidéo « ${nom} » ${remplace ? "remplacée" : "ajoutée"}`);
      router.refresh();
    }
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

  const entrees = (
    <>
      <input ref={camera} type="file" accept="video/*" capture="environment" className="hidden" onChange={videoChoisie(false)} aria-hidden="true" tabIndex={-1} />
      <input ref={galerie} type="file" accept="video/*" className="hidden" onChange={videoChoisie(true)} aria-hidden="true" tabIndex={-1} />
    </>
  );

  /* ---------- Étape 3 : relire, puis refaire ou valider ---------- */
  if (etape === "revoir" && revue) {
    const tropLourde = revue.mo > TAILLE_MAX_MO;
    const longue = !tropLourde && revue.duree > DUREE_CONSEILLEE_S + 1;
    const courte = !tropLourde && revue.duree > 0 && revue.duree < DUREE_COURTE_S;
    return (
      <Screen bg="nuit" className="gap-3.5">
        {entrees}
        <div className="flex items-center justify-between">
          <RoundButton icon="back" label="Revenir à la caméra" onClick={() => { setRevue(undefined); setEtape("filmer"); }} variant="sombre" />
          <span className={cx("rounded-full px-3.5 py-2.5 text-[13px] font-bold", tropLourde ? "bg-attention-solid text-attention-on" : "bg-nuit-3")}>
            {revue.duree > 0 ? `${fmt(revue.duree)} · ` : ""}{fmtMo(revue.mo)}{revue.importee ? " · importée" : ""}
          </span>
        </div>

        <div className="anim-in">
          <p className="text-xs font-bold tracking-[0.06em] text-pervenche uppercase">Vérifiez avant d&apos;envoyer</p>
          <h1 className="text-[30px] leading-9 font-extrabold">{revue.piece}</h1>
        </div>

        <video src={revue.src} controls playsInline muted className="anim-in max-h-[300px] w-full flex-1 rounded-card bg-nuit-2 object-contain" aria-label={`Vidéo de la pièce ${revue.piece}`} />

        {tropLourde && (
          <div role="alert" className="anim-in flex items-center gap-3 rounded-[22px] bg-attention-solid px-4 py-3.5 text-attention-on">
            <Triangle size={22} fill="#3B2600" mark="#E9A21B" />
            <span className="text-[15px] leading-5 font-bold">Vidéo trop lourde ({fmtMo(revue.mo)}, {TAILLE_MAX_MO} Mo au plus) : filmez à nouveau en 30 secondes environ.</span>
          </div>
        )}
        {longue && (
          <div role="status" className="anim-in flex items-center gap-3 rounded-[22px] bg-info-bg px-4 py-3.5 text-info-text">
            <CircleInfo size={22} />
            <span className="text-[15px] leading-5 font-bold">Plus de 30 secondes : l&apos;analyse sera plus longue. Vous pouvez valider ou refaire plus court.</span>
          </div>
        )}
        {courte && (
          <div role="alert" className="anim-in flex items-center gap-3 rounded-[22px] bg-attention-bg px-4 py-3.5 text-attention-text">
            <Triangle size={22} />
            <span className="text-[15px] leading-5 font-bold">Vidéo très courte : la pièce risque d&apos;être incomplète.</span>
          </div>
        )}
        {!tropLourde && !longue && !courte && <p className="text-sm text-pervenche-soft">Toute la pièce est visible ? Validez. Sinon, refaites-la.</p>}

        <div className="mt-auto flex gap-2.5">
          <button
            type="button"
            onClick={() => (revue.importee ? galerie.current?.click() : camera.current?.click())}
            className="inline-flex h-[54px] flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-white text-base font-bold text-white transition active:scale-[0.98]"
          >
            <Icon name="redo" size={18} />
            {revue.importee ? "Autre vidéo" : "Refaire"}
          </button>
          <Pill variant="blanc" onClick={() => void valider()} disabled={tropLourde} className="flex-[1.4]">
            <Icon name="check" size={18} />
            Valider
          </Pill>
        </div>
      </Screen>
    );
  }

  /* ---------- Étape 2 : filmer la pièce choisie ---------- */
  if (etape === "filmer" && piece) {
    return (
      <Screen bg="nuit" className="gap-3">
        {entrees}
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
          <span className="anim-in absolute top-5 left-5 rounded-full bg-nuit-3 px-3 py-2 text-[13px] font-semibold">Appuyez sur le bouton pour filmer</span>
          <span className="absolute right-5 bottom-5 rounded-full bg-nuit-3 px-3 py-2 text-xs font-semibold text-pervenche-soft">50 Mo max</span>
          {consigne && <span className="absolute bottom-5 left-5 max-w-[60%] text-xs leading-4 text-pervenche-soft">À montrer : {consigne}</span>}
          {conseilsCam && (
            <div className="anim-in absolute inset-3 flex flex-col gap-2 rounded-[22px] bg-nuit/95 p-4">
              <b className="text-[15px]">Bien filmer</b>
              {CONSEILS.map((x) => (
                <span key={x.icon} className="flex items-center gap-2.5 text-[13px] leading-[18px]">
                  <Icon name={x.icon} size={18} className="text-pervenche" />
                  {x.texte}
                </span>
              ))}
            </div>
          )}
        </div>

        {message && <p role="alert" className="text-center text-sm font-semibold text-pervenche-soft">{message}</p>}

        <div className="flex items-center justify-center gap-6">
          <span className="flex flex-col items-center gap-1">
            <RoundButton icon="upload" label="Importer une vidéo de la pièce" size={56} onClick={() => galerie.current?.click()} />
            <span className="text-xs font-semibold">Vidéos</span>
          </span>
          <button
            type="button"
            onClick={() => { setConseilsCam(false); camera.current?.click(); }}
            aria-label="Filmer la pièce"
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[5px] border-pervenche bg-white transition active:scale-95"
          >
            <span className="h-9 w-9 rounded-full bg-[#FF5A5A]" />
          </button>
          <span className="flex flex-col items-center gap-1">
            <RoundButton
              icon="eye"
              label={conseilsCam ? "Masquer les conseils" : "Voir les conseils pour bien filmer"}
              size={56}
              onClick={() => setConseilsCam(!conseilsCam)}
              variant={conseilsCam ? "pervenche" : "blanc"}
            />
            <span className="text-xs font-semibold">Conseils</span>
          </span>
        </div>
      </Screen>
    );
  }

  /* ---------- Étape 1 : pièces filmées + choix d'une pièce ---------- */
  return (
    <Screen bg="nuit" className="gap-4">
      {entrees}
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
        <p className="mt-1 text-sm text-pervenche-soft">Choisissez la pièce, puis filmez-la environ 30 secondes ou importez une vidéo. Elle est supprimée un mois après l&apos;envoi.</p>
      </div>

      <section className="rounded-[22px] bg-nuit-2">
        <button type="button" onClick={() => setConseils(!conseils)} aria-expanded={conseils} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pervenche text-nuit">
            <Icon name="eye" size={18} />
          </span>
          <span className="flex flex-1 flex-col">
            <b className="text-[15px]">Bien filmer en 5 conseils</b>
            <span className="text-xs text-pervenche-soft">Une bonne vidéo donne des cotes justes.</span>
          </span>
          <Icon name="down" size={20} className={cx("text-pervenche-soft transition-transform duration-300", conseils && "rotate-180")} />
        </button>
        {conseils && (
          <ol className="anim-in flex flex-col gap-2.5 px-4 pb-4">
            {CONSEILS.map((x, i) => (
              <li key={x.icon} className="flex items-center gap-3 text-[13px] leading-[18px]">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-nuit-3 text-xs font-extrabold text-pervenche">{i + 1}</span>
                <span className="flex-1">{x.texte}</span>
                <Icon name={x.icon} size={18} className="text-pervenche" />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Pièces filmées" className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.06em] text-pervenche-soft uppercase">
          Déjà filmées · <span key={filmees.length} className="anim-bump inline-block">{filmees.length}</span>
        </p>
        {filmees.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-[22px] bg-nuit-2 px-4 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-succes-solid text-white">
              <Icon name="check" size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[15px]">{p.nom}</b>
              <span className="truncate text-xs text-pervenche-soft">{detail(p)}</span>
            </span>
            <button type="button" onClick={() => choisir(p.nom)} className="h-9 flex-none rounded-full bg-nuit-3 px-3.5 text-xs font-bold transition active:scale-95">
              Refilmer
            </button>
          </div>
        ))}
      </section>

      {etape === "choix" ? (
        <section aria-label="Choisir la pièce" className="anim-in flex flex-col gap-2.5 rounded-[26px] bg-nuit-2 p-4">
          <b className="text-[15px]">Quelle pièce allez-vous filmer ?</b>
          <div className="flex flex-wrap gap-2">
            {restantes.map((p) => (
              <Chip key={p.nom} dark onClick={() => choisir(p.nom)}>
                {p.nom}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-pervenche-soft">Déjà filmée ? Choisissez la pièce, puis « Vidéos » pour l&apos;importer.</p>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setEtape("choix")}
          className="flex h-14 items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-pervenche text-[15px] font-bold text-pervenche transition active:scale-[0.98]"
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
      {toast.node}
    </Screen>
  );
}
