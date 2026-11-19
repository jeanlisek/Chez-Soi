import { NextResponse } from "next/server";

import { evaluerAbsence } from "@/lib/absence";
import { absenceEntreeSchema, getContratSortieSchema } from "@/lib/schemas";
import { clientAdmin, clientServeur } from "@/lib/supabase/server";

/**
 * Compare les dates d'absence au seuil d'inoccupation du contrat et à la fenêtre OTV, et
 * prépare l'usage 3 (issue #14). Calcul seul : rien n'est envoyé, aucune session H n'est
 * créée ici.
 *
 * Connexion requise. Le logement est vérifié sous RLS (un utilisateur ne voit que le sien),
 * puis les clauses `inoccupation` et `absence` sont lues par `get_contrat_champs` (RPC
 * réservée au serveur). Le client n'envoie que le logement et les dates.
 *
 * Reste à faire : écrire la ligne `absences` (`depasse_seuil`, `delai_otv_ok`, `protections`).
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
  const { logement_id, depart_le, retour_le } = analyse.data;

  const utilisateur = await clientServeur();
  const admin = clientAdmin();
  if (!utilisateur || !admin) return NextResponse.json({ erreur: "Supabase n'est pas configuré." }, { status: 503 });
  const {
    data: { user },
  } = await utilisateur.auth.getUser();
  if (!user) return NextResponse.json({ erreur: "Connexion requise." }, { status: 401 });

  // Sous RLS : un logement qui n'est pas le sien est introuvable.
  const { data: logement } = await utilisateur.from("logements").select("id").eq("id", logement_id).maybeSingle();
  if (!logement) return NextResponse.json({ erreur: "Logement introuvable." }, { status: 404 });

  // `null` sans contrat (parcours B) : l'absence est quand même évaluée, assureur « recommandé ».
  const { data, error } = await admin.rpc("get_contrat_champs", {
    p_logement_id: logement_id,
    p_champs: ["inoccupation", "absence"],
  });
  if (error) return NextResponse.json({ erreur: "Contrat illisible pour ce logement." }, { status: 500 });
  const clauses = getContratSortieSchema
    .pick({ inoccupation: true, absence: true })
    .safeParse(data ?? {});
  if (!clauses.success) return NextResponse.json({ erreur: "Contrat illisible pour ce logement." }, { status: 500 });

  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  try {
    return NextResponse.json(evaluerAbsence({ depart_le, retour_le, ...clauses.data }, aujourdhui));
  } catch (erreur) {
    return NextResponse.json({ erreur: erreur instanceof Error ? erreur.message : "Erreur." }, { status: 400 });
  }
}
