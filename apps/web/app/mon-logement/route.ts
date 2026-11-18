import { NextResponse, type NextRequest } from "next/server";

import { clientServeur } from "@/lib/supabase/server";

/**
 * Après connexion : ouvre le logement de l'utilisateur, ou le crée au premier passage
 * (RLS : `logements.user_id = auth.uid()`), puis démarre le parcours au profil.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await clientServeur();
  if (!supabase) return NextResponse.redirect(`${origin}/connexion`);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/connexion`);

  const { data: existant } = await supabase
    .from("logements")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existant) return NextResponse.redirect(`${origin}/logement/${existant.id}/plan`);

  const { data: cree, error } = await supabase.from("logements").insert({ user_id: user.id }).select("id").single();
  if (error || !cree) return NextResponse.redirect(`${origin}/connexion?erreur=logement`);
  return NextResponse.redirect(`${origin}/logement/${cree.id}/profil`);
}
