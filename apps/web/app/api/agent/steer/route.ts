import { reponseStub } from "@/lib/stub";

/** Message envoyé à une session en cours (ex. « moins de 50 € »). */
export async function POST() {
  return reponseStub("/api/agent/steer", "POST");
}
