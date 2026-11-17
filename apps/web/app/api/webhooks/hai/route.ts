import { reponseStub } from "@/lib/stub";

/** Webhooks signés H : vérification de signature, doublons, mise à jour de `runs_agent`. */
export async function POST() {
  return reponseStub("/api/webhooks/hai", "POST");
}
