import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { clientAdmin } from "@/lib/supabase/server";

/**
 * POST /api/analyse/modele-url : n8n (`pipeline_analyse`) demande où déposer le modèle 3D (.glb)
 * d'une analyse terminée, avant que le Space ne se mette en veille et ne l'efface.
 * Appel serveur à serveur, authentifié par `X-Chez-Soi-Secret`. Renvoie une URL de dépôt signée
 * (bucket privé `modeles3d`, chemin `{user_id}/{logement_id}/{analyse_id}.glb`) : n8n y envoie le
 * fichier directement, sans passer par Vercel (limite de 4,5 Mo par requête). Aucune clé Supabase chez n8n.
 * Renvoie aussi où déposer l'image annotée de l'analyse (la vue de la vidéo où l'objet est encadré
 * avec sa cote) : bucket privé `exports`, même chemin en `.jpg`. Son absence ne bloque pas le modèle.
 */
const entree = z.object({ analyse_id: z.uuid(), logement_id: z.uuid() });

function autorise(request: Request): boolean {
  const attendu = process.env.N8N_WEBHOOK_SECRET;
  const recu = request.headers.get("x-chez-soi-secret");
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorise(request)) return NextResponse.json({ message: "Non autorisé." }, { status: 401 });
  const corps = entree.safeParse(await request.json().catch(() => null));
  if (!corps.success) return NextResponse.json({ message: "Entrée invalide." }, { status: 400 });
  const { analyse_id, logement_id } = corps.data;

  const admin = clientAdmin();
  if (!admin) return NextResponse.json({ message: "Écriture serveur non configurée." }, { status: 503 });

  const { data: analyse } = await admin.from("analyses").select("id, logement_id").eq("id", analyse_id).maybeSingle();
  if (!analyse || analyse.logement_id !== logement_id)
    return NextResponse.json({ message: "Analyse inconnue pour ce logement." }, { status: 404 });
  const { data: logement } = await admin.from("logements").select("user_id").eq("id", logement_id).single();
  if (!logement) return NextResponse.json({ message: "Logement introuvable." }, { status: 404 });

  const chemin = `${logement.user_id}/${logement_id}/${analyse_id}.glb`;
  const { data, error } = await admin.storage.from("modeles3d").createSignedUploadUrl(chemin, { upsert: true });
  if (error || !data) return NextResponse.json({ message: "URL de dépôt non créée.", erreur: error?.message }, { status: 500 });
  const cheminImage = `${logement.user_id}/${logement_id}/${analyse_id}.jpg`;
  const image = await admin.storage.from("exports").createSignedUploadUrl(cheminImage, { upsert: true });
  return NextResponse.json({
    signed_url: data.signedUrl,
    path: chemin,
    image_signed_url: image.data?.signedUrl ?? null,
    image_path: image.data ? cheminImage : null,
  });
}
