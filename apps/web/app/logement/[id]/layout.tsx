import { notFound } from "next/navigation";

import { ParcoursProvider } from "@/lib/demo/etat";
import { chargerLogement } from "@/lib/donnees";

export default async function LayoutLogement({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const logement = await chargerLogement(id);
  if (!logement) notFound();
  return <ParcoursProvider logement={logement}>{children}</ParcoursProvider>;
}
