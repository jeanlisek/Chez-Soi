import { Inscription } from "@/components/cs/Inscription";

const ERREURS: Record<string, string> = {
  lien: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.",
  logement: "Votre logement n'a pas pu être créé. Réessayez dans un instant.",
};

/** Connexion : même écran que l'inscription (Google ou lien par e-mail, sans mot de passe). */
export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  return <Inscription erreurInitiale={erreur ? ERREURS[erreur] : undefined} />;
}
