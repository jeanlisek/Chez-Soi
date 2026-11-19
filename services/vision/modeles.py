"""Modèles utilisés par le service vision, chacun figé sur une révision (commit) de sa fiche Hugging Face.

La licence notée est celle lue sur la fiche À CETTE RÉVISION (champ `license` du README), le 18/11/2026.
Règle du projet : aucun modèle sous licence non commerciale (CC BY-NC ou équivalent).
Avant de changer une révision, relire la fiche à la nouvelle révision et mettre à jour `licence` et `verifie_le`.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Modele:
    depot: str
    revision: str
    licence: str
    role: str
    verifie_le: str = "2026-11-18"

    @property
    def fiche(self) -> str:
        return f"https://huggingface.co/{self.depot}/blob/{self.revision}/README.md"


MOGE = Modele(
    "Ruicheng/moge-2-vitl-normal", "cb0e8bbd6b1e243589717c78e750b1ba4c093acf", "mit",
    "Points 3D métriques à partir d'une seule image",
)
GROUNDING_DINO = Modele(
    "IDEA-Research/grounding-dino-base", "12bdfa3120f3e7ec7b434d90674b3396eccf88eb", "apache-2.0",
    "Détection des éléments par description textuelle",
)
SAM = Modele(
    "facebook/sam2.1-hiera-small", "ee5bba1d82bb8749febdf90f45e84b687142ba03", "apache-2.0",
    "Contour précis d'un élément à partir de sa boîte",
)
# Attention : les révisions du 18/12/2025 au 20/01/2026 de cette fiche indiquaient cc-by-nc-4.0.
# Celle-ci (04/02/2026) indique apache-2.0 et contient les poids du 20/01/2026.
MAPANYTHING = Modele(
    "facebook/map-anything-apache", "00f9c245bbcb60522d1ed7f9e9d88462c6e3f38a", "apache-2.0",
    "Reconstruction 3D métrique multi-vues (Space GPU)",
)
DA3_BASE = Modele(
    "depth-anything/DA3-BASE", "f4a6c9b3c95e41c82048423d3493a81ec3fa810e", "apache-2.0",
    "Secours : poses et profondeur relative multi-vues",
)
DA3_METRIC = Modele(
    "depth-anything/DA3METRIC-LARGE", "4010e39f3634a45bc60553321fb49fb760bd594e", "apache-2.0",
    "Secours : profondeur métrique à partir d'une seule image",
)

SIGLIP = Modele(
    "google/siglip-base-patch16-224", "7fd15f0689c79d79e38b1c2e2e2370a7bf2761ed", "apache-2.0",
    "Deuxième avis sur chaque point détecté (image comparée à des descriptions)", verifie_le="2026-11-19",
)

@dataclass(frozen=True)
class CodeFige:
    """Code tiers téléchargé depuis GitHub, figé sur un commit."""

    depot: str
    revision: str
    licence: str
    role: str
    verifie_le: str = "2026-11-18"

    @property
    def archive(self) -> str:
        return f"https://github.com/{self.depot}/archive/{self.revision}.zip"


# MapAnything charge ce code par torch.hub, qui prend par défaut la branche main : on le fige ici.
# Licence lue dans le fichier LICENSE du dépôt à ce commit.
CODE_DINOV2 = CodeFige(
    "facebookresearch/dinov2", "7764ea0f912e53c92e82eb78a2a1631e92725fc8", "apache-2.0",
    "Code de l'encodeur DINOv2 utilisé par MapAnything",
)

MODELES = {m.depot: m for m in (MOGE, GROUNDING_DINO, SAM, MAPANYTHING, DA3_BASE, DA3_METRIC, SIGLIP)}
