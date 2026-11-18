import { redirect } from "next/navigation";

/** La route `/profil` de la v3 mène au profil du logement exemple tant qu'aucun compte n'est connecté. */
export default function PageProfil() {
  redirect("/logement/exemple/profil");
}
