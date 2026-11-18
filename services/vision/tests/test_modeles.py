import re

from modeles import MODELES

LICENCES_ADMISES = {"apache-2.0", "mit"}


def test_chaque_modele_est_fige_sur_un_commit_complet():
    assert MODELES
    for modele in MODELES.values():
        assert re.fullmatch(r"[0-9a-f]{40}", modele.revision), modele.depot


def test_aucun_modele_n_est_sous_licence_non_commerciale():
    for modele in MODELES.values():
        assert modele.licence in LICENCES_ADMISES, f"{modele.depot} : {modele.licence}"


def test_la_fiche_citee_pointe_sur_la_revision_figee():
    for modele in MODELES.values():
        assert modele.fiche == f"https://huggingface.co/{modele.depot}/blob/{modele.revision}/README.md"


def test_le_code_dinov2_est_fige_sur_un_commit():
    from modeles import CODE_DINOV2

    assert re.fullmatch(r"[0-9a-f]{40}", CODE_DINOV2.revision)
    assert CODE_DINOV2.licence in LICENCES_ADMISES
    assert CODE_DINOV2.archive == f"https://github.com/facebookresearch/dinov2/archive/{CODE_DINOV2.revision}.zip"
