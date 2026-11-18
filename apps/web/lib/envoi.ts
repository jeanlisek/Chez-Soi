"use client";

import { clientNavigateur } from "@/lib/supabase/client";
import { TAILLE_MAX_OCTETS, type UploadPreparerSortie, type UploadTermineSortie } from "@/lib/schemas";

/**
 * Envoie une vidéo de pièce ou un contrat : URL signée (`/api/upload`), envoi direct vers
 * Supabase Storage depuis le navigateur, puis enregistrement et déclenchement (`/api/upload/termine`).
 */
export async function envoyerFichier({
  logementId,
  type,
  fichier,
  piece,
}: {
  logementId: string;
  type: "video" | "contrat";
  fichier: File;
  piece?: string;
}): Promise<{ ok: true; resultat: UploadTermineSortie } | { ok: false; message: string }> {
  if (fichier.size > TAILLE_MAX_OCTETS)
    return {
      ok: false,
      message: `Fichier trop lourd (${Math.round(fichier.size / 1_048_576)} Mo, 50 Mo au plus) : une vidéo par pièce, environ 30 secondes en 720p.`,
    };
  const supabase = clientNavigateur();
  if (!supabase) return { ok: false, message: "Le service n'est pas encore configuré." };

  const r1 = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logement_id: logementId, type, piece, nom_fichier: fichier.name, taille_octets: fichier.size }),
  });
  const prep = (await r1.json().catch(() => ({}))) as Partial<UploadPreparerSortie> & { message?: string };
  if (!r1.ok || !prep.bucket || !prep.path || !prep.token)
    return { ok: false, message: prep.message ?? "Envoi impossible pour l'instant." };

  const { error } = await supabase.storage
    .from(prep.bucket)
    .uploadToSignedUrl(prep.path, prep.token, fichier, { contentType: fichier.type || undefined });
  if (error) return { ok: false, message: "L'envoi du fichier a échoué. Vérifiez la connexion et réessayez." };

  const r2 = await fetch("/api/upload/termine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logement_id: logementId, type, piece, path: prep.path }),
  });
  const fin = (await r2.json().catch(() => ({}))) as UploadTermineSortie & { message?: string };
  if (!r2.ok) return { ok: false, message: fin.message ?? "Fichier reçu, mais l'enregistrement a échoué." };
  return { ok: true, resultat: fin };
}
