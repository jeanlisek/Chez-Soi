import Link from "next/link";

const LOGEMENT_EXEMPLE = "exemple";

const etapes = [
  { href: "/profil", libelle: "Profil des occupants" },
  { href: `/logement/${LOGEMENT_EXEMPLE}/capture`, libelle: "Capture du logement" },
  { href: `/logement/${LOGEMENT_EXEMPLE}/plan`, libelle: "Plan 3D" },
  { href: `/logement/${LOGEMENT_EXEMPLE}/actions`, libelle: "Actions" },
  { href: `/logement/${LOGEMENT_EXEMPLE}/absence`, libelle: "Mode absence" },
];

export default function Accueil() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-semibold">Chez Soi</h1>
        <p className="text-muted-foreground">Mieux, chez soi !</p>
      </header>
      <nav>
        <ul className="flex flex-col gap-2">
          {etapes.map((etape) => (
            <li key={etape.href}>
              <Link className="underline underline-offset-4" href={etape.href}>
                {etape.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-sm text-muted-foreground">Squelette : les pages sont vides.</p>
    </main>
  );
}
