import { NextResponse, type NextRequest } from "next/server";

import { clientServeur } from "@/lib/supabase/server";

/** Retour de Google ou du lien e-mail : échange du code contre une session, puis le logement. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const supabase = await clientServeur();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/mon-logement`);
  }
  return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
}
