from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Cabinet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80)
    x_mm: int = Field(ge=0, le=100_000)
    y_mm: int = Field(ge=0, le=100_000)
    width_mm: int = Field(gt=0, le=20_000)
    height_mm: int = Field(gt=0, le=20_000)


class Face(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80)
    width_mm: int = Field(gt=0, le=100_000)
    height_mm: int = Field(gt=0, le=100_000)
    cabinets: list[Cabinet] = Field(min_length=1, max_length=1)

    @model_validator(mode="after")
    def cabinets_fit_inside_face(self) -> "Face":
        for cabinet in self.cabinets:
            if cabinet.x_mm + cabinet.width_mm > self.width_mm:
                raise ValueError("El gabinete excede el ancho de la cara.")
            if cabinet.y_mm + cabinet.height_mm > self.height_mm:
                raise ValueError("El gabinete excede la altura de la cara.")
        return self


class ScreenDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1, le=1)
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    source: str = Field(min_length=1, max_length=80)
    faces: list[Face] = Field(min_length=1, max_length=1)


app = FastAPI(title="Motor geométrico del diseñador LED", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/reference", response_model=ScreenDocument)
def reference() -> ScreenDocument:
    """Documento sintético para comprobar el flujo de dibujo de E01."""
    return ScreenDocument(
        schema_version=1,
        id="demo-cabinet-960",
        name="Gabinete de referencia",
        source="Demostración sintética; no es un modelo comercial",
        faces=[
            Face(
                id="face-front",
                width_mm=960,
                height_mm=960,
                cabinets=[
                    Cabinet(
                        id="cabinet-demo-001",
                        x_mm=0,
                        y_mm=0,
                        width_mm=960,
                        height_mm=960,
                    )
                ],
            )
        ],
    )


@app.post("/v1/validate", response_model=ScreenDocument)
def validate_document(document: ScreenDocument) -> ScreenDocument:
    """El esquema rechaza campos desconocidos y medidas no válidas."""
    return document
