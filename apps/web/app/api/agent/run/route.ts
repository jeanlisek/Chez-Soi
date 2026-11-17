import { reponseStub } from "@/lib/stub";

/** POST : crée une session H (usage 1, 2 ou 3). GET ?id= : lit son état. */
export async function POST() {
  return reponseStub("/api/agent/run", "POST");
}

export async function GET() {
  return reponseStub("/api/agent/run", "GET");
}
