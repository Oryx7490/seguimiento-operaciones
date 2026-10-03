"""Casos de aceptación del motor. Los valores esperados se calculan a mano:
960 mm × 960 mm = 921,600 mm² por gabinete."""

import copy

import pytest
from fastapi.testclient import TestClient

import app as engine
from app import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_catalog(tmp_path, monkeypatch):
    """Cada prueba usa un catálogo temporal; no toca el catalog.json real."""
    monkeypatch.setenv("LED_CATALOG_PATH", str(tmp_path / "catalog.json"))
    engine.reset_catalog_cache()
    yield
    engine.reset_catalog_cache()
CABINET_MM2 = 960 * 960


def rectangle(rows: int, columns: int) -> dict:
    response = client.post("/v1/rectangle", json={"rows": rows, "columns": columns})
    assert response.status_code == 200, response.text
    return response.json()


def validate(document: dict):
    return client.post("/v1/validate", json=document)


def test_health_reports_versions():
    data = client.get("/health").json()
    assert data["status"] == "ok"
    assert data["schema_version"] == 2


def test_reference_single_cabinet():
    data = client.get("/v1/reference").json()
    assert data["summary"]["cabinet_count"] == 1
    assert data["summary"]["active_area_mm2"] == 921_600
    assert data["summary"]["active_area_m2"] == pytest.approx(0.9216)


@pytest.mark.parametrize(
    ("rows", "columns", "count", "width", "height", "area_mm2", "area_m2"),
    [
        (3, 4, 12, 3_840, 2_880, 11_059_200, 11.0592),
        (12, 16, 192, 15_360, 11_520, 176_947_200, 176.9472),
        (20, 20, 400, 19_200, 19_200, 368_640_000, 368.64),
        # Pantalla mayor registrada (35 × 13 m) cubierta con 960 mm: 37 × 14.
        (14, 37, 518, 35_520, 13_440, 477_388_800, 477.3888),
        (50, 100, 5_000, 96_000, 48_000, 4_608_000_000, 4_608.0),
    ],
)
def test_rectangle_acceptance(rows, columns, count, width, height, area_mm2, area_m2):
    data = rectangle(rows, columns)
    summary = data["summary"]
    face = summary["faces"][0]
    assert summary["cabinet_count"] == count
    assert (face["width_mm"], face["height_mm"]) == (width, height)
    assert summary["active_area_mm2"] == area_mm2 == count * CABINET_MM2
    assert summary["active_area_m2"] == pytest.approx(area_m2)
    assert summary["models"] == [
        {
            "model_id": "hierro-960x960",
            "name": "Hierro exterior 960 × 960 mm",
            "status": "demo",
            "width_mm": 960,
            "height_mm": 960,
            "depth_mm": None,
            "quantity": count,
            "area_mm2": area_mm2,
            "area_m2": pytest.approx(area_m2),
        }
    ]


def test_document_structure_and_grid_labels():
    document = rectangle(3, 4)["document"]
    assert document["schema_version"] == 2
    assert document["units"] == "mm"
    assert document["template"] == {
        "type": "rectangle",
        "params": {"rows": 3, "columns": 4, "model_id": "hierro-960x960"},
    }
    assert document["catalog"]["revision"] == "disenador-2026-10-03"
    assert document["joins"] == []
    face = document["faces"][0]
    assert face["normal"] == [0.0, 0.0, 1.0]

    placements = {p["id"]: p for p in document["placements"]}
    assert len(placements) == 12
    # Fila 1 es la superior: su Y es la más alta.
    top_left = placements["cabinet-r01-c01"]
    assert top_left["grid"] == {"row": 1, "column": 1}
    assert (top_left["x_mm"], top_left["y_mm"]) == (0, 1_920)
    bottom_right = placements["cabinet-r03-c04"]
    assert bottom_right["grid"] == {"row": 3, "column": 4}
    assert (bottom_right["x_mm"], bottom_right["y_mm"]) == (2_880, 0)


def test_unknown_depth_is_flagged():
    warnings = rectangle(1, 1)["summary"]["warnings"]
    assert any("profundidad desconocida" in warning for warning in warnings)
    assert any("demostración" in warning for warning in warnings)


@pytest.mark.parametrize(
    ("payload", "field", "message"),
    [
        ({"rows": 101, "columns": 4}, "Filas", "Debe ser menor o igual que 100."),
        ({"rows": 51, "columns": 100}, "", "La pantalla admite hasta 5,000 gabinetes; se pidieron 5,100."),
        ({"rows": 0, "columns": 4}, "Filas", "Debe ser mayor o igual que 1."),
        ({"rows": 3, "columns": 2.5}, "Columnas", "Debe ser un número entero."),
        ({"rows": 3}, "Columnas", "Falta este dato o no es numérico."),
        ({"rows": None, "columns": 4}, "Filas", "Falta este dato o no es numérico."),
        ({"rows": 3, "columns": 4, "x": 1}, "x", "Campo no admitido."),
    ],
)
def test_rectangle_rejections_are_readable(payload, field, message):
    response = client.post("/v1/rectangle", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "Datos no válidos."
    assert {"field": field, "message": message} in body["issues"]


def test_validate_round_trip_preserves_results():
    generated = rectangle(3, 4)
    response = validate(generated["document"])
    assert response.status_code == 200
    assert response.json() == generated


def _invalid(mutate) -> dict:
    document = copy.deepcopy(rectangle(3, 4)["document"])
    mutate(document)
    response = validate(document)
    assert response.status_code == 422, response.text
    return response.json()


def test_rejects_cabinet_outside_face():
    body = _invalid(lambda d: d["placements"][0].update(x_mm=3_000))
    assert "excede el ancho" in body["issues"][0]["message"]


def test_rejects_unknown_model():
    body = _invalid(lambda d: d["placements"][0].update(model_id="no-existe"))
    assert "modelo inexistente" in body["issues"][0]["message"]


def test_rejects_unknown_face():
    body = _invalid(lambda d: d["placements"][0].update(face_id="face-x"))
    assert "cara inexistente" in body["issues"][0]["message"]


def test_rejects_duplicate_placement_ids():
    body = _invalid(lambda d: d["placements"][1].update(id=d["placements"][0]["id"]))
    assert "ID repetido" in body["issues"][0]["message"]


def test_rejects_non_orthogonal_axes():
    body = _invalid(lambda d: d["faces"][0].update(v_axis=[1.0, 0.0, 0.0]))
    assert "perpendiculares" in body["issues"][0]["message"]


def test_rejects_normal_facing_away():
    body = _invalid(lambda d: d["faces"][0].update(normal=[0.0, 0.0, -1.0]))
    assert "U × V" in body["issues"][0]["message"]


def test_joins_reserved_but_not_accepted_yet():
    join = {"id": "j1", "face_a_id": "face-front", "face_b_id": "face-front", "angle_deg": 90}
    _invalid(lambda d: d["joins"].append(join))


def test_rejects_old_schema_version():
    _invalid(lambda d: d.update(schema_version=1))


def fit(width_mm: int, height_mm: int) -> dict:
    response = client.post("/v1/fit", json={"target_width_mm": width_mm, "target_height_mm": height_mm})
    assert response.status_code == 200, response.text
    return response.json()


def test_fit_acceptance_4x3m():
    """Objetivo 4000 x 3000 mm con 960 mm: 4 x 3 -> 3840 x 2880, diff -160/-120."""
    data = fit(4000, 3000)
    first = data["proposals"][0]
    assert (first["columns"], first["rows"]) == (4, 3)
    assert (first["width_mm"], first["height_mm"]) == (3840, 2880)
    assert (first["diff_width_mm"], first["diff_height_mm"]) == (-160, -120)
    assert first["cabinet_count"] == 12
    assert first["area_m2"] == pytest.approx(11.0592)
    # No se aplica nada: sólo propuestas.
    assert len(data["proposals"]) == 4


def test_fit_exact_target_has_zero_diff():
    data = fit(3840, 2880)
    assert data["proposals"][0]["diff_width_mm"] == 0
    assert data["proposals"][0]["diff_height_mm"] == 0


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"target_width_mm": 0, "target_height_mm": 3000}, "Base objetivo"),
        ({"target_width_mm": -100, "target_height_mm": 3000}, "Base objetivo"),
        ({"target_width_mm": 4000, "target_height_mm": 2.5}, "Altura objetivo"),
        ({"target_width_mm": 4000}, "Altura objetivo"),
        ({"target_width_mm": 4000, "target_height_mm": 3000, "model_id": "no-existe"}, ""),
    ],
)
def test_fit_rejections(payload, field):
    response = client.post("/v1/fit", json=payload)
    assert response.status_code == 422
    body = response.json()
    if field:
        assert any(i["field"] == field for i in body["issues"])


def test_catalog_lists_iron_models():
    data = client.get("/v1/catalog").json()
    assert [m["id"] for m in data["models"]] == [
        "hierro-640x640", "hierro-640x960", "hierro-960x960", "hierro-1280x960",
    ]
    assert all(m["material"] == "hierro" and m["environment"] == "exterior" for m in data["models"])


def test_add_model_and_modulate_with_it():
    created = client.post("/v1/catalog/models", json={
        "name": "Hierro exterior 500 × 500 mm",
        "width_mm": 500, "height_mm": 500, "stock_qty": 2000,
    })
    assert created.status_code == 200, created.text
    model = created.json()
    assert model["id"] == "custom-hierro-exterior-500-500-mm"
    assert model["status"] == "reference"
    data = client.post("/v1/rectangle", json={"rows": 26, "columns": 70, "model_id": model["id"]}).json()
    assert data["summary"]["cabinet_count"] == 1820
    assert (data["summary"]["faces"][0]["width_mm"], data["summary"]["faces"][0]["height_mm"]) == (35_000, 13_000)


def test_edit_model():
    created = client.post("/v1/catalog/models", json={
        "name": "Aluminio 640 x 640 mm", "width_mm": 640, "height_mm": 640,
        "material": "aluminio", "environment": "interior", "stock_qty": 50,
    })
    assert created.status_code == 200, created.text
    model_id = created.json()["id"]
    updated = client.put(f"/v1/catalog/models/{model_id}", json={
        "height_mm": 960, "material": "aluminio maquinado", "stock_qty": 40,
    })
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert (body["height_mm"], body["material"], body["stock_qty"]) == (960, "aluminio maquinado", 40)
    assert body["width_mm"] == 640 and body["environment"] == "interior"
    # El catálogo refleja el cambio.
    ids = [m["id"] for m in client.get("/v1/catalog").json()["models"]]
    assert model_id in ids


def test_edit_model_rejections():
    assert client.put("/v1/catalog/models/no-existe", json={"height_mm": 960}).status_code == 422
    created = client.post("/v1/catalog/models", json={
        "name": "Hierro 500", "width_mm": 500, "height_mm": 500,
    }).json()
    assert client.put(f"/v1/catalog/models/{created['id']}", json={"material": "madera"}).status_code == 422
    assert client.put(f"/v1/catalog/models/{created['id']}", json={"width_mm": 0}).status_code == 422


def test_add_model_rejections():
    assert client.post("/v1/catalog/models", json={"name": "X", "width_mm": 0, "height_mm": 500}).status_code == 422
    assert client.post("/v1/catalog/models", json={"width_mm": 500, "height_mm": 500}).status_code == 422


def test_fit_with_1280_model():
    """4 x 3 m con 1280 x 960: 3 x 3 -> 3840 x 2880, 9 piezas."""
    response = client.post("/v1/fit", json={"target_width_mm": 4000, "target_height_mm": 3000, "model_id": "hierro-1280x960"})
    assert response.status_code == 200, response.text
    first = response.json()["proposals"][0]
    assert (first["columns"], first["rows"]) == (3, 3)
    assert (first["width_mm"], first["height_mm"]) == (3840, 2880)
    assert first["cabinet_count"] == 9


def test_fit_with_640_model():
    """4 x 3 m con 640 x 640: primera propuesta 6 x 5 -> 3840 x 3200, 30 piezas."""
    response = client.post("/v1/fit", json={"target_width_mm": 4000, "target_height_mm": 3000, "model_id": "hierro-640x640"})
    assert response.status_code == 200, response.text
    first = response.json()["proposals"][0]
    assert (first["columns"], first["rows"]) == (6, 5)
    assert first["cabinet_count"] == 30
