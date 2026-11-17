import { reponseStub } from "@/lib/stub";

/** URL signée Supabase Storage (vidéo ou contrat). */
export async function POST() {
  return reponseStub("/api/upload", "POST");
}
