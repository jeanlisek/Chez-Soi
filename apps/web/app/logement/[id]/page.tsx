import { redirect } from "next/navigation";

export default async function PageLogement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/logement/${id}/plan`);
}
