import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { clientAdmin } from "@/lib/supabase/server";

/**
 * GET /api/purge/videos : supprime les vidéos envoyées il y a plus d'un mois (bucket `videos`).
 * Appelée chaque jour par le cron Vercel (`apps/web/vercel.json`), qui envoie l'en-tête
 * `Authorization: Bearer <CRON_SECRET>`. Sans ce secret, la route refuse tout.
 * Seule la vidéo d'origine part : modèle 3D, image annotée, points et cotes restent.
 * La liste vient de `videos_a_purger` (migration 0011), la suppression de l'API Storage.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAR_LOT = 100;
const LOTS_MAX = 10;

function autorise(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const recu = Buffer.from(request.headers.get("authorization") ?? "");
  const attendu = Buffer.from(`Bearer ${secret}`);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}

export async function GET(request: Request) {
  if (!autorise(request)) return NextResponse.json({ message: "Non autorisé." }, { status: 401 });
  const admin = clientAdmin();
  if (!admin) return NextResponse.json({ message: "Supabase non configuré." }, { status: 503 });

  let supprimees = 0;
  for (let lot = 0; lot < LOTS_MAX; lot++) {
    const { data, error } = await admin.rpc("videos_a_purger", { p_limite: PAR_LOT });
    if (error) {
      console.error("purge vidéos : liste illisible", error.message);
      return NextResponse.json({ message: "Liste des vidéos à purger illisible.", supprimees }, { status: 500 });
    }
    const chemins = (data ?? []).map((ligne) => ligne.chemin);
    if (chemins.length === 0) break;
    const { error: erreur } = await admin.storage.from("videos").remove(chemins);
    if (erreur) {
      console.error("purge vidéos : suppression interrompue", erreur.message);
      return NextResponse.json({ message: "Suppression interrompue.", supprimees }, { status: 500 });
    }
    supprimees += chemins.length;
    if (chemins.length < PAR_LOT) break;
  }
  return NextResponse.json({ supprimees });
}
