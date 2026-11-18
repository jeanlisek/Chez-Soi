import { NextResponse } from "next/server";

import { exigerProprietaire } from "@/lib/auth";
import { uploadPreparerEntreeSchema, type UploadPreparerSortie } from "@/lib/schemas";

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "piece"
  );
}

/**
 * POST /api/upload : URL signée d'envoi vers un bucket privé (`videos` ou `contrats`).
 * Chemin `{user_id}/{logement_id}/…` imposé par la RLS de Storage. Refus au-delà de 50 Mo.
 */
export async function POST(request: Request) {
  const corps = uploadPreparerEntreeSchema.safeParse(await request.json().catch(() => null));
  if (!corps.success)
    return NextResponse.json({ message: corps.error.issues[0]?.message ?? "Entrée invalide." }, { status: 400 });
  const { logement_id, type, piece, nom_fichier } = corps.data;

  const verif = await exigerProprietaire(logement_id);
  if ("erreur" in verif) return verif.erreur;
  const { supabase, user } = verif;

  const ext = (nom_fichier.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const bucket = type === "video" ? "videos" : "contrats";
  if (type === "contrat" && !["pdf", "jpg", "jpeg", "png", "heic"].includes(ext))
    return NextResponse.json({ message: "Contrat attendu en PDF ou en photo." }, { status: 400 });
  if (type === "video" && !["mp4", "mov", "m4v", "webm"].includes(ext))
    return NextResponse.json({ message: "Vidéo attendue en MP4 ou MOV." }, { status: 400 });

  const dossier = type === "video" ? slug(piece ?? "piece") : "contrat";
  const path = `${user.id}/${logement_id}/${dossier}/${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data)
    return NextResponse.json({ message: "Impossible de préparer l'envoi." }, { status: 500 });

  const sortie: UploadPreparerSortie = { bucket, path: data.path, token: data.token };
  return NextResponse.json(sortie);
}
