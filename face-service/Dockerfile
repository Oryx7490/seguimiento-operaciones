FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    INSIGHTFACE_HOME=/models

# build-essential/Cython compilan las extensiones de insightface; libgl/libglib
# las necesita OpenCV aunque solo procesemos imágenes en memoria.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libgomp1 \
        tesseract-ocr \
        tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Hornea los modelos en la imagen (evita descargas en tiempo de ejecución).
RUN python -c "from insightface.app import FaceAnalysis; fa = FaceAnalysis(name='buffalo_l', root='/models'); fa.prepare(ctx_id=-1, det_size=(640, 640))"

# Modelo OpenCV Zoo SFace fijado por SHA-256; se mantiene aparte de buffalo_l.
RUN mkdir -p /models/opencv_sface && python - <<'PY'
import hashlib
import os
import urllib.request

url = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
target = "/models/opencv_sface/face_recognition_sface_2021dec.onnx"
temporary = target + ".download"
expected = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
urllib.request.urlretrieve(url, temporary)
digest = hashlib.sha256()
with open(temporary, "rb") as model:
    for block in iter(lambda: model.read(1024 * 1024), b""):
        digest.update(block)
if digest.hexdigest() != expected:
    raise RuntimeError(f"SHA-256 inesperado para SFace: {digest.hexdigest()}")
os.replace(temporary, target)
PY

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
