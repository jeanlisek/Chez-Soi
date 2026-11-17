type Props = {
  params: Promise<{ id: string }>;
};

export default async function PageCapture({ params }: Props) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Capture du logement</h1>
      <p className="text-muted-foreground">Logement {id} · à implémenter.</p>
    </main>
  );
}
