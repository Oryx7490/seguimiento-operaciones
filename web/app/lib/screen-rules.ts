// Reglas de validación de medidas de pantallas. Fuente única usada por el
// endpoint de auditoría admin y, en el futuro, por el formulario de captura.
//
// El objetivo es detectar errores de captura típicos: órdenes de magnitud
// (0.016 vs 0.16), dimensiones imposibles, áreas inconsistentes con ancho×alto
// y desviaciones frente al catálogo de la cuenta.

export interface ScreenAuditSource {
  width_m?: number | string | null;
  height_m?: number | string | null;
  area_m2?: number | string | null;
  is_irregular: boolean;
  pitch_mm?: number | string | null;
  quantity: number;
}

export interface ScreenAuditCatalogRef {
  width_m?: number | string | null;
  height_m?: number | string | null;
  area_m2?: number | string | null;
  pitch_mm?: number | string | null;
}

export interface ScreenAuditResult {
  errors: string[];
  warnings: string[];
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isNearInteger(n: number): boolean {
  return n > 0 && Math.abs(n - Math.round(n)) / n <= 0.005;
}

function fmt(v: number): string {
  const s = String(Math.round(v * 10000) / 10000);
  return s;
}

function deviation(actual: number | null, ref: number | null): number | null {
  if (actual == null || ref == null || ref === 0) return null;
  return actual / ref;
}

export function auditScreenMeasures(
  screen: ScreenAuditSource,
  catalog?: ScreenAuditCatalogRef | null,
  catalogName?: string | null
): ScreenAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const w = num(screen.width_m);
  const h = num(screen.height_m);
  const area = num(screen.area_m2);
  const pitch = num(screen.pitch_mm);
  const regular = !screen.is_irregular;
  const cat = catalog ?? null;
  const catW = cat ? num(cat.width_m) : null;
  const catH = cat ? num(cat.height_m) : null;
  const catArea = cat ? num(cat.area_m2) : null;
  const catPitch = cat ? num(cat.pitch_mm) : null;
  const refName = catalogName?.trim() ? `catálogo "${catalogName.trim()}"` : "catálogo";

  // 1) Plausibilidad básica.
  if (regular) {
    if (w != null && w <= 0) errors.push("El ancho debe ser > 0");
    if (h != null && h <= 0) errors.push("El alto debe ser > 0");
    if (w == null && h == null && area == null) errors.push("Faltan dimensiones (ancho/alto o área)");
  } else {
    if (area == null || area <= 0) errors.push("Pantalla irregular requiere área > 0");
  }
  if (pitch != null && pitch <= 0) errors.push("El pitch debe ser > 0");
  if (!Number.isFinite(screen.quantity) || screen.quantity <= 0) errors.push("La cantidad debe ser > 0");

  // 2) Coherencia ancho × alto vs área (en pantallas regulares).
  if (regular && w != null && w > 0 && h != null && h > 0) {
    const calc = w * h;
    if (area != null && area > 0) {
      const tol = Math.max(calc * 0.02, 0.02);
      if (Math.abs(area - calc) > tol) {
        errors.push(`Área ${fmt(area)} m² no coincide con ${fmt(w)} × ${fmt(h)} = ${fmt(calc)} m²`);
      }
    }
    const ratio = w / h;
    if (ratio < 0.5 || ratio > 100) {
      warnings.push(`Relación ancho/alto de ${fmt(ratio)}:1 inusual (${fmt(w)} × ${fmt(h)})`);
    }
  } else if (regular && area != null && area > 0 && (w == null || h == null)) {
    warnings.push("Tiene área pero faltan ancho y/o alto");
  }

  // 3) Orden de magnitud y tamaños imposibles.
  if (regular) {
    if (h != null && h > 0 && h < 0.01) {
      errors.push(`Alto ${fmt(h)} m imposible (< 1 cm)`);
    } else if (h != null && h > 0 && h < 0.05) {
      warnings.push(`Alto ${fmt(h)} m muy pequeño: ¿falta un cero? (¿${fmt(h * 10)} m?)`);
    }
    if (w != null && w > 0 && w < 0.05) {
      warnings.push(`Ancho ${fmt(w)} m muy pequeño: ¿falta un cero?`);
    }
    if (w != null && w > 30) warnings.push(`Ancho ${fmt(w)} m inusualmente grande (> 30 m)`);
    if (h != null && h > 8) warnings.push(`Alto ${fmt(h)} m inusualmente grande (> 8 m)`);
  }
  if (pitch != null && (pitch < 0.8 || pitch > 25)) {
    warnings.push(`Pitch ${fmt(pitch)} mm fuera del rango físico típico (0.8–25 mm)`);
  }

  // 4) Píxeles enteros a partir del pitch (pantallas regulares).
  if (regular && w != null && h != null && pitch != null && pitch > 0) {
    const pxW = (w * 1000) / pitch;
    const pxH = (h * 1000) / pitch;
    if (!isNearInteger(pxW) || !isNearInteger(pxH)) {
      warnings.push(
        `Con pitch ${fmt(pitch)} mm no da píxeles enteros (${pxW.toFixed(1)} × ${pxH.toFixed(1)} px)`
      );
    }
  }

  // 5) Desviación frente al catálogo de la cuenta (orden de magnitud).
  const dims: Array<[string, number | null, number | null]> = [
    ["ancho", w, catW],
    ["alto", h, catH],
  ];
  for (const [label, actual, ref] of dims) {
    const f = deviation(actual, ref);
    if (f == null) continue;
    if (f >= 5 || f <= 0.2) {
      errors.push(`El ${label} es ${fmt(actual!)} m pero el ${refName} dice ${fmt(ref!)} m (difiere ${fmt(f)}×)`);
    } else if (f >= 1.5 || f <= 0.6) {
      warnings.push(`El ${label} es ${fmt(actual!)} m vs ${refName} (${fmt(ref!)} m, ${fmt(f)}×)`);
    }
  }
  const fArea = deviation(regular ? area : null, catArea);
  if (fArea != null && (fArea >= 5 || fArea <= 0.2)) {
    errors.push(`El área es ${fmt(area!)} m² pero el ${refName} dice ${fmt(catArea!)} m² (difiere ${fmt(fArea)}×)`);
  } else if (fArea != null && (fArea >= 1.5 || fArea <= 0.6)) {
    warnings.push(`El área es ${fmt(area!)} m² vs ${refName} (${fmt(catArea!)} m², ${fmt(fArea)}×)`);
  }
  if (pitch != null && catPitch != null && Math.abs(pitch - catPitch) / catPitch > 0.15) {
    warnings.push(`Pitch ${fmt(pitch)} mm difiere del ${refName} (${fmt(catPitch)} mm)`);
  }

  return { errors, warnings };
}