# Image du service vision, prévue pour un Space Docker Hugging Face avec GPU (port 7860, utilisateur 1000).
FROM python:3.11-slim

# git : MoGe et MapAnything s'installent depuis GitHub. libglib2.0-0 : requis par OpenCV (qui décode la vidéo
# lui-même). fonts-dejavu-core : police de l'image annotée (« × » et accents).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git libglib2.0-0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app

COPY --chown=user requirements.txt requirements-modeles.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps -r requirements-modeles.txt

# Les poids sont téléchargés à la construction, aux révisions figées dans modeles.py :
# le service démarre sans réseau et ne peut pas charger une autre révision.
COPY --chown=user modeles.py telecharger_modeles.py ./
COPY --chown=user pipeline ./pipeline
# Sur un réseau qui bloque le stockage Xet de Hugging Face : docker build --build-arg HF_HUB_DISABLE_XET=1 .
ARG HF_HUB_DISABLE_XET=0
RUN HF_HUB_DISABLE_XET=$HF_HUB_DISABLE_XET python telecharger_modeles.py
ENV HF_HUB_OFFLINE=1 \
    VISION_RECONSTRUCTION=1

COPY --chown=user . .

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
