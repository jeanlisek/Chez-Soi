"""Pipeline d'analyse de la vidéo du logement : images nettes, détection, points 3D métriques, cotes, export."""

import os

# Certaines opérations des modèles n'existent pas encore sur le GPU Apple : elles repassent alors sur le processeur.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
