"""Télécharge les poids des modèles aux révisions figées (lancé à la construction de l'image Docker)."""

from huggingface_hub import hf_hub_download, snapshot_download

from modeles import GROUNDING_DINO, MAPANYTHING, MOGE, SAM

# On ne prend que les poids safetensors : les dépôts contiennent aussi des doublons .bin et .pt.
FICHIERS = ["*.json", "*.txt", "model.safetensors"]

if __name__ == "__main__":
    for modele in (GROUNDING_DINO, SAM, MAPANYTHING):
        snapshot_download(modele.depot, revision=modele.revision, allow_patterns=FICHIERS)
        print(f"{modele.depot} @ {modele.revision[:8]} ({modele.licence})")
    hf_hub_download(MOGE.depot, "model.pt", revision=MOGE.revision)
    print(f"{MOGE.depot} @ {MOGE.revision[:8]} ({MOGE.licence})")

    # MapAnything charge le code de DINOv2 par torch.hub : on le met dans l'image, au commit figé dans modeles.py.
    from modeles import CODE_DINOV2
    from pipeline.reconstruction import code_dinov2

    print(f"{CODE_DINOV2.depot} @ {CODE_DINOV2.revision[:8]} ({CODE_DINOV2.licence}) → {code_dinov2()}")
