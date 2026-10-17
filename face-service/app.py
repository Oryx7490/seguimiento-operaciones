import base64
import binascii
import hashlib
import os
from pathlib import Path

import cv2
import insightface
import numpy as np
import onnxruntime as ort
import pytesseract
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from insightface.app import FaceAnalysis

MODEL_PACK = os.environ.get("FACE_MODEL_PACK", "buffalo_l")
DET_SIZE = int(os.environ.get("FACE_DET_SIZE", "640"))
MIN_SCORE = float(os.environ.get("FACE_MIN_SCORE", "0.5"))
MODEL_ROOT = os.environ.get("INSIGHTFACE_HOME", "/models")
OCR_LANG = os.environ.get("OCR_LANG", "spa+eng")
SFACE_ENABLED = os.environ.get("FACE_SFACE_ENABLED", "true").lower() != "false"
SFACE_EXPECTED_SHA256 = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
SFACE_MODEL_PATH = os.environ.get(
    "SFACE_MODEL_PATH", "/models/opencv_sface/face_recognition_sface_2021dec.onnx"
)

app = FastAPI(title="face-service", version="1.1.0")
analyzer: FaceAnalysis | None = None
sface_model = None
sface_sha256: str | None = None


@app.on_event("startup")
def load_model() -> None:
    global analyzer, sface_model, sface_sha256
    analyzer = FaceAnalysis(name=MODEL_PACK, root=MODEL_ROOT, providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))
    if SFACE_ENABLED:
        try:
            if os.path.isfile(SFACE_MODEL_PATH):
                digest = hashlib.sha256()
                with open(SFACE_MODEL_PATH, "rb") as model_file:
                    for block in iter(lambda: model_file.read(1024 * 1024), b""):
                        digest.update(block)
                sface_sha256 = digest.hexdigest()
                if sface_sha256 == SFACE_EXPECTED_SHA256 and hasattr(cv2, "FaceRecognizerSF_create"):
                    sface_model = cv2.FaceRecognizerSF_create(SFACE_MODEL_PATH, "", 0, 0)
                else:
                    print("SFace experimental no se cargó: checksum o API OpenCV no coincide", flush=True)
            else:
                print(f"SFace experimental deshabilitado: falta {SFACE_MODEL_PATH}", flush=True)
        except cv2.error as exc:
            print(f"SFace experimental no pudo cargar: {exc}", flush=True)


@app.get("/health")
def health() -> dict:
    providers = ort.get_available_providers()
    checks = {
        "insightface": {
            "ok": analyzer is not None,
            "version": getattr(insightface, "__version__", "desconocida"),
            "model": MODEL_PACK,
            "embedding_dim": 512,
        },
        "opencv": {
            "ok": hasattr(cv2, "FaceRecognizerSF_create"),
            "version": cv2.__version__,
            "sface_api": hasattr(cv2, "FaceRecognizerSF_create"),
        },
        "onnxruntime": {
            "ok": "CPUExecutionProvider" in providers,
            "version": ort.__version__,
            "available_providers": providers,
            "active_provider": "CPUExecutionProvider",
        },
        "sface": {
            "enabled": SFACE_ENABLED,
            "ok": not SFACE_ENABLED or (
                sface_model is not None and sface_sha256 == SFACE_EXPECTED_SHA256
            ),
            "loaded": sface_model is not None,
            "model_file": Path(SFACE_MODEL_PATH).name,
            "sha256": sface_sha256,
            "expected_sha256": SFACE_EXPECTED_SHA256,
            "embedding_dim": 128,
        },
    }
    errors = [name for name, check in checks.items() if not check["ok"]]
    warnings = []
    if "CUDAExecutionProvider" not in providers:
        warnings.append("ONNX Runtime no ofrece CUDA; la inferencia está usando CPU.")
    return {
        "status": "ok" if not errors else "warning",
        "model": MODEL_PACK,
        "ready": analyzer is not None,
        "dim": 512,
        "sface_ready": sface_model is not None,
        "sface_dim": 128,
        "det_size": DET_SIZE,
        "ocr_lang": OCR_LANG,
        "diagnostics": {"status": "ok" if not errors else "error", "errors": errors, "warnings": warnings, "tools": checks},
    }


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


@app.post("/sface")
def detect_sface(req: DetectRequest) -> dict:
    """Embedding experimental SFace, alineado con landmarks del detector actual."""
    if analyzer is None:
        raise HTTPException(status_code=503, detail="Modelo de detección no listo")
    if sface_model is None:
        raise HTTPException(status_code=503, detail="Modelo SFace experimental no listo")

    img = _decode(req.image_base64)
    height, width = img.shape[:2]
    results = []
    for face in analyzer.get(img):
        score = float(face.det_score)
        if score < MIN_SCORE or face.kps is None:
            continue
        x1, y1, x2, y2 = (float(v) for v in face.bbox)
        landmarks = np.asarray(face.kps, dtype=np.float32).reshape(10)
        # OpenCV FaceRecognizerSF.alignCrop espera el formato de FaceDetectorYN:
        # x, y, ancho, alto, cinco puntos (10 valores), confianza.
        face_row = np.concatenate(
            (
                np.asarray([x1, y1, x2 - x1, y2 - y1], dtype=np.float32),
                landmarks,
                np.asarray([score], dtype=np.float32),
            )
        ).reshape(1, 15)
        aligned = sface_model.alignCrop(img, face_row)
        embedding = sface_model.feature(aligned).reshape(-1).astype(np.float32)
        norm = float(np.linalg.norm(embedding))
        if norm <= 0:
            continue
        embedding /= norm
        results.append(
            {
                "bbox": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
                "det_score": score,
                "embedding": [float(v) for v in embedding.tolist()],
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

