import base64
import binascii
import os

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from insightface.app import FaceAnalysis

MODEL_PACK = os.environ.get("FACE_MODEL_PACK", "buffalo_l")
DET_SIZE = int(os.environ.get("FACE_DET_SIZE", "640"))
MIN_SCORE = float(os.environ.get("FACE_MIN_SCORE", "0.5"))
MODEL_ROOT = os.environ.get("INSIGHTFACE_HOME", "/models")

app = FastAPI(title="face-service", version="1.0.0")
analyzer: FaceAnalysis | None = None


@app.on_event("startup")
def load_model() -> None:
    global analyzer
    analyzer = FaceAnalysis(name=MODEL_PACK, root=MODEL_ROOT, providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_PACK, "ready": analyzer is not None, "dim": 512, "det_size": DET_SIZE}


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
