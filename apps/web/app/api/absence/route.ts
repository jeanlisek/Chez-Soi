import { reponseStub } from "@/lib/stub";

/** Compare les dates au seuil d'inoccupation, prépare l'usage 3. */
export async function POST() {
  return reponseStub("/api/absence", "POST");
}
