"""Déploie services/vision sur un Space Docker Hugging Face.

Sans --confirmer, le script n'envoie rien : il affiche ce qu'il ferait.
HF_TOKEN est lu dans l'environnement, sinon dans le fichier .env indiqué par --env. Il n'est jamais affiché.
"""

import argparse
import os
import re
from pathlib import Path

ICI = Path(__file__).parent
IGNORES = [".venv/**", "**/__pycache__/**", ".pytest_cache/**", "tests/**", "donnees/**", "sorties/**",
           "*.mov", "*.mp4", "**/.DS_Store", ".DS_Store", "deployer_space.py"]


def fichiers_a_envoyer(dossier: Path) -> list[str]:
    """Chemins envoyés vers le Space : le service et le plan B, sans vidéos ni résultats locaux."""
    from huggingface_hub.utils import filter_repo_objects

    chemins = sorted(str(f.relative_to(dossier)) for f in dossier.rglob("*") if f.is_file())
    return list(filter_repo_objects(chemins, ignore_patterns=IGNORES))


def lire_env(chemin: Path) -> dict[str, str]:
    if not chemin.exists():
        return {}
    lignes = (re.match(r"\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)", ligne) for ligne in chemin.read_text().splitlines())
    return {m.group(1): m.group(2).strip().strip("\"'") for m in lignes if m}


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parseur.add_argument("--space", required=True, help="Identifiant du Space : compte/nom.")
    parseur.add_argument("--env", type=Path, default=ICI.parents[1] / ".env", help="Fichier .env qui contient HF_TOKEN.")
    parseur.add_argument("--materiel", default=None, help="Matériel payant à demander (ex. l4x1). Rien par défaut.")
    parseur.add_argument("--veille-s", type=int, default=1800, help="Mise en veille après inactivité (matériel payant).")
    parseur.add_argument("--public", action="store_true", help="Space public (privé par défaut).")
    parseur.add_argument("--confirmer", action="store_true", help="Envoie réellement vers Hugging Face.")
    options = parseur.parse_args()

    variables = {**lire_env(options.env), **os.environ}
    jeton, cle_service = variables.get("HF_TOKEN"), variables.get("VISION_API_KEY")
    print(f"Space : {options.space} ({'public' if options.public else 'privé'}, Docker)")
    print(f"HF_TOKEN : {'présent' if jeton else 'ABSENT'} · VISION_API_KEY : {'présente' if cle_service else 'absente'}")
    print(f"Matériel demandé : {options.materiel or 'aucun (inchangé)'}")
    envoi = fichiers_a_envoyer(ICI)
    hors_depot = [f for f in envoi if f.startswith("precalcule/") and not f.endswith("failles.json")]
    print(f"Fichiers à envoyer : {len(envoi)}, dont {len(hors_depot)} du plan B absents du dépôt git (images, .glb)")
    for fichier in envoi:
        print("   ", fichier)
    if not options.confirmer:
        print("Simulation : rien n'a été envoyé. Relancer avec --confirmer.")
        return
    if not jeton:
        raise SystemExit("HF_TOKEN est absent : ajoute-le au .env (jamais dans le dépôt).")

    from huggingface_hub import HfApi

    api = HfApi(token=jeton)
    if api.repo_exists(options.space, repo_type="space"):
        # Le plan B contient des images d'un vrai logement : on n'envoie rien vers un Space public par erreur.
        if api.space_info(options.space).private is not True and not options.public:
            raise SystemExit("Le Space existe mais n'est pas privé : rien n'a été envoyé (ajouter --public pour forcer).")
    else:
        api.create_repo(options.space, repo_type="space", space_sdk="docker", private=not options.public)
    if cle_service:
        api.add_space_secret(options.space, "VISION_API_KEY", cle_service)
    if options.materiel:  # avant l'envoi, pour que la première construction parte directement sur ce matériel
        api.request_space_hardware(options.space, options.materiel, sleep_time=options.veille_s)
    api.upload_folder(repo_id=options.space, repo_type="space", folder_path=str(ICI), ignore_patterns=IGNORES,
                      commit_message="Déploie le service vision")
    print(f"Envoyé : https://huggingface.co/spaces/{options.space}")


if __name__ == "__main__":
    main()
