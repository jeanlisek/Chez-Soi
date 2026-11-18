import { NextResponse } from "next/server";

import { evaluerAbsence } from "@/lib/absence";
import { absenceEntreeSchema } from "@/lib/schemas";

/**
 * Compare les dates d'absence au seuil d'inoccupation du contrat et à la fenêtre OTV, et dit
 * s'il faut préparer l'usage 3 (issue #14). Calcul seul : rien n'est envoyé, aucune session
 * H n'est créée ici.
 *
 * À brancher quand le client Supabase existera : lire `inoccupation` avec
 * `get_contrat_champs(logement_id, ['inoccupation'])` (serveur) au lieu du corps, puis
 * écrire la ligne `absences` (`depasse_seuil`, `delai_otv_ok`, `protections`).
 */
export async function POST(requete: Request) {
  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Corps JSON attendu." }, { status: 400 });
  }
  const analyse = absenceEntreeSchema.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json(
      {
        erreur: "Entrée invalide.",
        details: analyse.error.issues.map((probleme) => `${probleme.path.join(".")} : ${probleme.message}`),
      },
      { status: 400 },
    );
  }
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  try {
    return NextResponse.json(evaluerAbsence(analyse.data, aujourdhui));
  } catch (erreur) {
    return NextResponse.json({ erreur: erreur instanceof Error ? erreur.message : "Erreur." }, { status: 400 });
  }
}
