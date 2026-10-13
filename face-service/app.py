import base64
import binascii
import os

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from insightface.app import FaceAnalysis

MODEL_PACK = os.environ.get("FACE_MODEL_PACK", "buffalo_l")
DET_SIZE = int(os.environ.get("FACE_DET_SIZE", "640"))
MIN_SCORE = float(os.environ.get("FACE_MIN_SCORE", "0.5"))
MODEL_ROOT = os.environ.get("INSIGHTFACE_HOME", "/models")
OCR_LANG = os.environ.get("OCR_LANG", "spa+eng")

app = FastAPI(title="face-service", version="1.0.0")
analyzer: FaceAnalysis | None = None


@app.on_event("startup")
def load_model() -> None:
    global analyzer
    analyzer = FaceAnalysis(name=MODEL_PACK, root=MODEL_ROOT, providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_PACK, "ready": analyzer is not None, "dim": 512, "det_size": DET_SIZE, "ocr_lang": OCR_LANG}


class DetectRequest(BaseModel):
    image_base64: str


def _decode(image_base64: str) -> np.ndarray:
    raw = image_base64
    if "," in raw[:64] and raw.strip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError) as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"base64 inválido: {exc}") from exc
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen")
    return img


@app.post("/detect")
def detect(req: DetectRequest) -> dict:
    if analyzer is None:
        raise HTTPException(status_code=503, detail="Modelo no listo")
    img = _decode(req.image_base64)
    height, width = img.shape[:2]
    faces = analyzer.get(img)

    results = []
    for face in faces:
        score = float(face.det_score)
        if score < MIN_SCORE:
            continue
        x1, y1, x2, y2 = (float(v) for v in face.bbox)
        emb = face.normed_embedding
        if emb is None:
            continue
        results.append(
            {
                "bbox": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "det_score": score,
                "embedding": [float(v) for v in emb.tolist()],
            }
        )

    results.sort(key=lambda r: r["det_score"], reverse=True)
    return {"width": width, "height": height, "count": len(results), "faces": results}


class OcrRequest(BaseModel):
    image_base64: str
    lang: str | None = None


def _preprocess_for_ocr(img: np.ndarray) -> np.ndarray:
    # Las marcas de agua (hora/fecha/ubicación) suelen ser chicas: se amplía.
    height, width = img.shape[:2]
    largest = max(height, width)
    if largest < 1600:
        scale = 1600.0 / largest
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return gray


@app.post("/ocr")
def ocr(req: OcrRequest) -> dict:
    img = _decode(req.image_base64)
    lang = req.lang or OCR_LANG
    try:
        gray = _preprocess_for_ocr(img)

        # Texto normal + intento en modo "bloque uniforme" (marcas de agua).
        text = pytesseract.image_to_string(gray, lang=lang)
        alt = pytesseract.image_to_string(gray, lang=lang, config="--psm 6")

        data = pytesseract.image_to_data(gray, lang=lang, output_type=pytesseract.Output.DICT)
        confs = [int(c) for c in data.get("conf", []) if str(c).lstrip("-").isdigit() and int(c) >= 0]
        mean_conf = sum(confs) / len(confs) if confs else None

        # Se conserva la lectura con más texto reconocido.
        best = text if len(text.strip()) >= len(alt.strip()) else alt
        lines = [line.strip() for line in best.splitlines() if line.strip()]
        return {"text": best, "alt_text": alt, "lines": lines, "mean_conf": mean_conf, "lang": lang}
    except pytesseract.TesseractError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"OCR error: {exc}") from exc

