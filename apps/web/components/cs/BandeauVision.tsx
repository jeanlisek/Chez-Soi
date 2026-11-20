import Link from "next/link";

/**
 * Panne du service d'analyse vidéo (20/11) : le Space Hugging Face ne démarre plus
 * (erreur d'infrastructure « MOUNT_ATTR_IDMAP », sur L4 comme sur L40S). Le bandeau le dit
 * et oriente vers le logement exemple. Repasser à `false` dès que le Space répond.
 */
export const ANALYSE_VIDEO_INDISPONIBLE = true;

export function BandeauVision({ sombre = false }: { sombre?: boolean }) {
  if (!ANALYSE_VIDEO_INDISPONIBLE) return null;
  return (
    <p role="status" className={sombre ? "rounded-[20px] bg-white/10 px-4 py-3 text-[13px] leading-[18px] text-white" : "rounded-[20px] bg-attention-bg px-4 py-3 text-[13px] leading-[18px] text-attention-text"}>
      <b>Analyse des nouvelles vidéos momentanément indisponible</b> : notre hébergeur de calcul (Hugging Face) est en panne. Le reste
      fonctionne : pour voir tout le parcours, avec le replay d&apos;une vraie session de l&apos;agent, ouvrez le{" "}
      <Link href="/logement/exemple/plan" className="font-bold underline underline-offset-2">logement exemple</Link>.
    </p>
  );
}
