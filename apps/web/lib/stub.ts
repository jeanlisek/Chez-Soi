import { NextResponse } from "next/server";

import type { StubReponse } from "@/lib/schemas";

/** Réponse 501 typée, commune à toutes les routes API du squelette. */
export function reponseStub(
  route: string,
  methode: StubReponse["methode"],
): NextResponse<StubReponse> {
  return NextResponse.json(
    {
      stub: true,
      route,
      methode,
      message: "Non implémenté : squelette du monorepo.",
    },
    { status: 501 },
  );
}
