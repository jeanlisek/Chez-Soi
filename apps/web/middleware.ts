import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Rafraîchit la session Supabase à chaque requête (cookies), sans rien bloquer. */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let reponse = NextResponse.next({ request });
  if (!url || !cle) return reponse;

  const supabase = createServerClient(url, cle, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (aPoser) => {
        for (const { name, value } of aPoser) request.cookies.set(name, value);
        reponse = NextResponse.next({ request });
        for (const { name, value, options } of aPoser) reponse.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return reponse;
}

export const config = {
  // Ni les fichiers statiques, ni les webhooks H (signés, sans session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb)$).*)"],
};
