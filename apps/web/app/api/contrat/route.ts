import { reponseStub } from "@/lib/stub";

/** Déclenche `analyse_contrat`, renvoie l'état d'extraction. */
export async function POST() {
  return reponseStub("/api/contrat", "POST");
}
