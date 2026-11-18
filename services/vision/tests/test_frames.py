import cv2
import numpy as np

from pipeline.frames import choisir_images, extraire_images, score_nettete


def _damier(taille: int = 240, case: int = 12) -> np.ndarray:
    y, x = np.indices((taille, taille))
    return (((x // case + y // case) % 2) * 255).astype(np.uint8)


def test_une_image_floue_a_un_score_plus_bas_que_la_meme_image_nette():
    nette = _damier()
    floue = cv2.GaussianBlur(nette, (21, 21), 8)
    assert score_nettete(floue) < score_nettete(nette) / 10


def test_choisir_images_garde_la_plus_nette_de_chaque_tranche_de_temps():
    scores = [1.0, 5.0, 2.0, 9.0, 3.0, 4.0]
    assert choisir_images(scores, nb=2) == [1, 3]


def test_choisir_images_renvoie_tout_quand_il_y_en_a_moins_que_demande():
    assert choisir_images([3.0, 1.0, 2.0], nb=10) == [0, 1, 2]


def _ecrire_video(chemin, nb_images: int = 60, fps: int = 30) -> None:
    video = cv2.VideoWriter(str(chemin), cv2.VideoWriter_fourcc(*"mp4v"), fps, (320, 240))
    for i in range(nb_images):
        image = np.zeros((240, 320, 3), np.uint8)
        cv2.rectangle(image, (10 + 4 * i, 40), (70 + 4 * i, 200), (255, 255, 255), -1)
        video.write(image)
    video.release()


def test_extraire_images_ecrit_le_nombre_demande_dans_l_ordre_du_temps(tmp_path):
    video = tmp_path / "essai.mp4"
    _ecrire_video(video)

    images = extraire_images(video, tmp_path / "images", nb=5, pas_s=0.1)

    assert len(images) == 5
    assert all(image.chemin.exists() for image in images)
    temps = [image.temps_s for image in images]
    assert temps == sorted(temps) and temps[-1] > temps[0]


def test_extraire_images_se_limite_au_segment_demande(tmp_path):
    video = tmp_path / "essai.mp4"
    _ecrire_video(video, nb_images=90)  # 3 secondes

    images = extraire_images(video, tmp_path / "images", nb=4, pas_s=0.1, debut_s=1.0, fin_s=2.0, premier_numero=10)

    assert len(images) == 4
    assert all(1.0 <= image.temps_s <= 2.0 for image in images)
    assert [image.chemin.name for image in images] == [f"image_{n:03d}.jpg" for n in range(10, 14)]
