import { reponseStub } from "@/lib/stub";

/** Custom tools : get_mesures, get_contrat, demander_validation (idempotents). */
export async function POST() {
  return reponseStub("/api/agent/tools", "POST");
}
