import { reponseStub } from "@/lib/stub";

/** GraphRAG + règles + LLM explicatif, renvoie les actions. */
export async function POST() {
  return reponseStub("/api/plan", "POST");
}
