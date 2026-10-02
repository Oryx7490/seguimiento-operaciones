"""Motor geométrico del diseñador LED.

Unidades: longitudes en milímetros (enteros en el plano de la cara) y áreas en
mm². Los m² se derivan dividiendo entre 1,000,000 sólo para presentación.
"""

import math
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

ENGINE_VERSION = "0.2.0"
SCHEMA_VERSION = 2
# Pantalla más grande registrada: 35 m × 13 m. Con gabinetes de 500 mm son
# 70 × 26 = 1,820 piezas; los límites dejan margen para casos mayores.
MAX_GRID = 100
MAX_CABINETS = 5_000
AXIS_TOLERANCE = 1e-9

Vector3 = tuple[float, float, float]
Identifier = str


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------
# Documento de diseño (schema_version 2)
# --------------------------------------------------------------------------


class CabinetModel(StrictModel):
    """Ficha de gabinete copiada en el documento como instantánea."""

    id: Identifier = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    width_mm: int = Field(gt=0, le=20_000)
    height_mm: int = Field(gt=0, le=20_000)
    # None significa profundidad desconocida; nunca se sustituye por un valor inventado.
    depth_mm: float | None = Field(default=None, gt=0, le=2_000)
    status: Literal["demo", "reference", "verified", "approved"]
    source: str = Field(min_length=1, max_length=200)


class CatalogSnapshot(StrictModel):
    revision: str = Field(min_length=1, max_length=80)
    models: list[CabinetModel] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_model_ids(self) -> "CatalogSnapshot":
        ids = [model.id for model in self.models]
        if len(ids) != len(set(ids)):
            raise ValueError("El catálogo contiene modelos con ID repetido.")
        return self


def _dot(a: Vector3, b: Vector3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a: Vector3, b: Vector3) -> Vector3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


class Face(StrictModel):
    """Superficie plana con coordenadas locales U/V.

    El origen es la esquina inferior izquierda vista desde el público; U crece
    hacia la derecha, V hacia arriba y la normal apunta hacia el público
    (normal = U × V). La envolvente mecánica queda detrás, en sentido -normal.
    """

    id: Identifier = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    origin_mm: Vector3
    u_axis: Vector3
    v_axis: Vector3
    normal: Vector3
    width_mm: int = Field(gt=0, le=100_000)
    height_mm: int = Field(gt=0, le=100_000)

    @model_validator(mode="after")
    def orthonormal_axes(self) -> "Face":
        for label, vector in (("U", self.u_axis), ("V", self.v_axis), ("normal", self.normal)):
            if not all(math.isfinite(value) for value in vector):
                raise ValueError(f"El eje {label} contiene valores no finitos.")
            if abs(math.sqrt(_dot(vector, vector)) - 1) > AXIS_TOLERANCE:
                raise ValueError(f"El eje {label} debe ser unitario.")
        if abs(_dot(self.u_axis, self.v_axis)) > AXIS_TOLERANCE:
            raise ValueError("Los ejes U y V deben ser perpendiculares.")
        expected = _cross(self.u_axis, self.v_axis)
        if any(abs(a - b) > AXIS_TOLERANCE for a, b in zip(expected, self.normal)):
            raise ValueError("La normal debe ser U × V y apuntar hacia el público.")
        if not all(math.isfinite(value) for value in self.origin_mm):
            raise ValueError("El origen de la cara contiene valores no finitos.")
        return self


class GridCell(StrictModel):
    """Posición en la retícula de la plantilla. Fila 1 = fila superior."""

    row: int = Field(ge=1, le=MAX_GRID)
    column: int = Field(ge=1, le=MAX_GRID)


class Placement(StrictModel):
    """Colocación de un gabinete físico sobre una cara."""

    id: Identifier = Field(min_length=1, max_length=80)
    model_id: Identifier = Field(min_length=1, max_length=80)
    face_id: Identifier = Field(min_length=1, max_length=80)
    x_mm: int = Field(ge=0, le=100_000)
    y_mm: int = Field(ge=0, le=100_000)
    # Sólo orientación normal por ahora; otros giros se habilitan con su ficha.
    rotation_deg: Literal[0] = 0
    grid: GridCell | None = None


class Join(StrictModel):
    """Estructura reservada para uniones entre caras (E17+). Aún no se admiten."""

    id: Identifier = Field(min_length=1, max_length=80)
    face_a_id: Identifier = Field(min_length=1, max_length=80)
    face_b_id: Identifier = Field(min_length=1, max_length=80)
    angle_deg: float


class RectangleParams(StrictModel):
    rows: int = Field(ge=1, le=MAX_GRID)
    columns: int = Field(ge=1, le=MAX_GRID)
    model_id: Identifier = Field(min_length=1, max_length=80)


class RectangleTemplate(StrictModel):
    type: Literal["rectangle"]
    params: RectangleParams


class ScreenDocument(StrictModel):
    schema_version: Literal[2]
    id: Identifier = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    source: str = Field(min_length=1, max_length=200)
    units: Literal["mm"]
    template: RectangleTemplate
    catalog: CatalogSnapshot
    faces: list[Face] = Field(min_length=1, max_length=1)
    placements: list[Placement] = Field(min_length=1, max_length=MAX_CABINETS)
    joins: list[Join] = Field(default_factory=list, max_length=0)

    @model_validator(mode="after")
    def references_and_bounds(self) -> "ScreenDocument":
        face_ids = [face.id for face in self.faces]
        if len(face_ids) != len(set(face_ids)):
            raise ValueError("Hay caras con ID repetido.")
        placement_ids = [placement.id for placement in self.placements]
        if len(placement_ids) != len(set(placement_ids)):
            raise ValueError("Hay gabinetes con ID repetido.")

        models = {model.id: model for model in self.catalog.models}
        faces = {face.id: face for face in self.faces}
        if self.template.params.model_id not in models:
            raise ValueError("La plantilla usa un modelo que no está en el catálogo.")
        for placement in self.placements:
            model = models.get(placement.model_id)
            if model is None:
                raise ValueError(f"El gabinete {placement.id} usa un modelo inexistente.")
            face = faces.get(placement.face_id)
            if face is None:
                raise ValueError(f"El gabinete {placement.id} apunta a una cara inexistente.")
            if placement.x_mm + model.width_mm > face.width_mm:
                raise ValueError(f"El gabinete {placement.id} excede el ancho de la cara.")
            if placement.y_mm + model.height_mm > face.height_mm:
                raise ValueError(f"El gabinete {placement.id} excede la altura de la cara.")
        return self


# --------------------------------------------------------------------------
# Resultados calculados (no forman parte del documento guardado)
# --------------------------------------------------------------------------


class ModelLine(StrictModel):
    model_id: str
    name: str
    status: str
    width_mm: int
    height_mm: int
    depth_mm: float | None
    quantity: int
    area_mm2: int
    area_m2: float


class FaceSummary(StrictModel):
    face_id: str
    name: str
    width_mm: int
    height_mm: int
    cabinet_count: int
    active_area_mm2: int
    active_area_m2: float


class Summary(StrictModel):
    cabinet_count: int
    active_area_mm2: int
    active_area_m2: float
    faces: list[FaceSummary]
    models: list[ModelLine]
    warnings: list[str]


class DesignResponse(StrictModel):
    engine_version: str
    document: ScreenDocument
    summary: Summary


def mm2_to_m2(area_mm2: int) -> float:
    return area_mm2 / 1_000_000


def summarize(document: ScreenDocument) -> Summary:
    models = {model.id: model for model in document.catalog.models}

    face_lines: list[FaceSummary] = []
    for face in document.faces:
        on_face = [p for p in document.placements if p.face_id == face.id]
        area = sum(models[p.model_id].width_mm * models[p.model_id].height_mm for p in on_face)
        face_lines.append(
            FaceSummary(
                face_id=face.id,
                name=face.name,
                width_mm=face.width_mm,
                height_mm=face.height_mm,
                cabinet_count=len(on_face),
                active_area_mm2=area,
                active_area_m2=mm2_to_m2(area),
            )
        )

    model_lines: list[ModelLine] = []
    for model in document.catalog.models:
        quantity = sum(1 for p in document.placements if p.model_id == model.id)
        if quantity == 0:
            continue
        area = quantity * model.width_mm * model.height_mm
        model_lines.append(
            ModelLine(
                model_id=model.id,
                name=model.name,
                status=model.status,
                width_mm=model.width_mm,
                height_mm=model.height_mm,
                depth_mm=model.depth_mm,
                quantity=quantity,
                area_mm2=area,
                area_m2=mm2_to_m2(area),
            )
        )

    warnings: list[str] = []
    for line in model_lines:
        if line.status == "demo":
            warnings.append(f"{line.name}: modelo de demostración, no es una ficha comercial.")
        if line.depth_mm is None:
            warnings.append(f"{line.name}: profundidad desconocida.")

    total_area = sum(line.active_area_mm2 for line in face_lines)
    return Summary(
        cabinet_count=len(document.placements),
        active_area_mm2=total_area,
        active_area_m2=mm2_to_m2(total_area),
        faces=face_lines,
        models=model_lines,
        warnings=warnings,
    )


def respond(document: ScreenDocument) -> DesignResponse:
    return DesignResponse(engine_version=ENGINE_VERSION, document=document, summary=summarize(document))


# --------------------------------------------------------------------------
# Plantillas
# --------------------------------------------------------------------------

DEMO_CATALOG = CatalogSnapshot(
    revision="demo-2026-10-02",
    models=[
        CabinetModel(
            id="demo-960x960",
            name="Gabinete demostración 960 × 960 mm",
            width_mm=960,
            height_mm=960,
            depth_mm=None,
            status="demo",
            source="Sintético para pruebas del diseñador; no es un modelo comercial",
        )
    ],
)

FRONT_FACE_AXES = {
    "origin_mm": (0.0, 0.0, 0.0),
    "u_axis": (1.0, 0.0, 0.0),
    "v_axis": (0.0, 1.0, 0.0),
    "normal": (0.0, 0.0, 1.0),
}


def build_rectangle(rows: int, columns: int, model_id: str = "demo-960x960") -> ScreenDocument:
    catalog = DEMO_CATALOG
    model = next((m for m in catalog.models if m.id == model_id), None)
    if model is None:
        raise ValueError("El modelo solicitado no está en el catálogo.")
    face = Face(
        id="face-front",
        name="Frente",
        width_mm=columns * model.width_mm,
        height_mm=rows * model.height_mm,
        **FRONT_FACE_AXES,
    )
    placements = [
        Placement(
            id=f"cabinet-r{row:02d}-c{column:02d}",
            model_id=model.id,
            face_id=face.id,
            x_mm=(column - 1) * model.width_mm,
            y_mm=(rows - row) * model.height_mm,
            grid=GridCell(row=row, column=column),
        )
        for row in range(1, rows + 1)
        for column in range(1, columns + 1)
    ]
    return ScreenDocument(
        schema_version=SCHEMA_VERSION,
        id=f"demo-rectangle-{columns}x{rows}",
        name=f"Pantalla rectangular {columns} × {rows}",
        source="Demostración sintética; no es un diseño comercial",
        units="mm",
        template=RectangleTemplate(
            type="rectangle",
            params=RectangleParams(rows=rows, columns=columns, model_id=model.id),
        ),
        catalog=catalog,
        faces=[face],
        placements=placements,
    )


class RectangleRequest(StrictModel):
    rows: int = Field(ge=1, le=MAX_GRID)
    columns: int = Field(ge=1, le=MAX_GRID)

    @model_validator(mode="after")
    def cabinet_limit(self) -> "RectangleRequest":
        if self.rows * self.columns > MAX_CABINETS:
            raise ValueError(f"La pantalla admite hasta {MAX_CABINETS:,} gabinetes; se pidieron {self.rows * self.columns:,}.")
        return self


# --------------------------------------------------------------------------
# Errores legibles
# --------------------------------------------------------------------------

FIELD_LABELS = {"rows": "Filas", "columns": "Columnas"}


def _issue_message(error: dict) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    if kind == "missing" or (kind.endswith("_type") and error.get("input", "") is None):
        return "Falta este dato o no es numérico."
    if kind == "extra_forbidden":
        return "Campo no admitido."
    if kind in {"int_type", "int_parsing", "int_from_float"}:
        return "Debe ser un número entero."
    if kind in {"float_type", "float_parsing", "finite_number"}:
        return "Debe ser un número finito."
    if kind == "greater_than_equal":
        return f"Debe ser mayor o igual que {ctx.get('ge')}."
    if kind == "greater_than":
        return f"Debe ser mayor que {ctx.get('gt')}."
    if kind == "less_than_equal":
        return f"Debe ser menor o igual que {ctx.get('le')}."
    if kind == "less_than":
        return f"Debe ser menor que {ctx.get('lt')}."
    if kind in {"too_short", "too_long"}:
        return "Cantidad de elementos fuera de los límites admitidos."
    if kind in {"literal_error", "enum"}:
        return "Valor no admitido."
    if kind == "json_invalid":
        return "El cuerpo de la solicitud no es JSON válido."
    if kind == "value_error":
        message = str(error.get("msg", ""))
        return message.removeprefix("Value error, ") or "Valor no válido."
    return "Valor no válido."


def _issue_field(error: dict) -> str:
    parts = [str(part) for part in error.get("loc", ()) if part != "body"]
    path = ".".join(parts)
    return FIELD_LABELS.get(path, path)


app = FastAPI(title="Motor geométrico del diseñador LED", version=ENGINE_VERSION)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    issues = [{"field": _issue_field(err), "message": _issue_message(err)} for err in exc.errors()]
    return JSONResponse(status_code=422, content={"error": "Datos no válidos.", "issues": issues})


@app.get("/health")
def health() -> dict[str, str | int]:
    return {"status": "ok", "engine_version": ENGINE_VERSION, "schema_version": SCHEMA_VERSION}


@app.get("/v1/reference", response_model=DesignResponse)
def reference() -> DesignResponse:
    """Gabinete único de referencia (flujo de dibujo de E01)."""
    document = build_rectangle(rows=1, columns=1).model_copy(
        update={"id": "demo-cabinet-960", "name": "Gabinete de referencia"}
    )
    return respond(document)


@app.post("/v1/rectangle", response_model=DesignResponse)
def rectangle(request: RectangleRequest) -> DesignResponse:
    """Genera una retícula rectangular y sus resultados calculados."""
    return respond(build_rectangle(rows=request.rows, columns=request.columns))


@app.post("/v1/validate", response_model=DesignResponse)
def validate_document(document: ScreenDocument) -> DesignResponse:
    """Valida un documento y devuelve sus resultados calculados."""
    return respond(document)
