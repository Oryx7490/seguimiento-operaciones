// Parser heurístico de texto OCR a candidatos de asistencia (V50).
// Formatos vistos: Timemark ("12 de oct.2026", hora grande "19:56", ubicación, código)
// y cámara con marca de agua ("12 oct 2026 8:01:19 p. m.").

const MONTHS = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sept: 9, sep: 9, oct: 10, nov: 11, dic: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12,
};

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function buildDate(day, monthName, year) {
  const month = MONTHS[norm(monthName).replace(/\./g, "")];
  const d = Number(day);
  if (!month || !year || d < 1 || d > 31) return null;
  return `${year}-${pad(month)}-${pad(d)}`;
}

function inferType(caption) {
  const c = norm(caption);
  if (!c) return null;
  if (/(me\s+retir|retiro|sal(ida|go|iendo)|fin\b|termin|acab|cerr|nos\s+vamos|ya\s+me\s+voy)/.test(c)) return "salida";
  if (/(buen\s*d|buenos\s*d|entr(ada|ando|o)|llego|llegu|inicio|ingres|comienz|present|iniciando)/.test(c)) return "entrada";
  return null;
}

export function parseAttendance(lines, caption) {
  const text = (lines || []).join("\n");
  const flat = text.replace(/\s+/g, " ");

  let date = null;
  let m = flat.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\.?\s*,?\s*(\d{4})/i);
  if (m) date = buildDate(m[1], m[2], m[3]);
  if (!date) {
    m = flat.match(/(\d{1,2})\s+([a-záéíóúñ]{3,})\.?\s+(\d{4})/i);
    if (m) date = buildDate(m[1], m[2], m[3]);
  }
  if (!date) {
    // Formato México: día/mes/año (también acepta . o -). Se intercambia solo si el mes
    // no es válido pero el día sí puede serlo (por si algún OCR leyera mes/día).
    m = flat.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
    if (m) {
      let day = Number(m[1]);
      let month = Number(m[2]);
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      if (month > 12 && day <= 12) {
        const tmp = day;
        day = month;
        month = tmp;
      }
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        date = `${year}-${pad(month)}-${pad(day)}`;
      }
    }
  }

  // Jornada completa (Timemark: "Trabajo 09:42 - 19:55"): da entrada y salida.
  let shiftIn = null;
  let shiftOut = null;
  const rm = flat.match(/(?:de\s+turno|turno|trabajo|jornada)\D{0,14}(\d{1,2}:\d{2})\s*[-–a]\s*(\d{1,2}:\d{2})/i);
  if (rm) {
    shiftIn = `${pad(Number(rm[1].split(":")[0]))}:${rm[1].split(":")[1]}:00`;
    shiftOut = `${pad(Number(rm[2].split(":")[0]))}:${rm[2].split(":")[1]}:00`;
  }

  // Horas trabajadas (Timemark: "10,18"): número con una o dos decimales.
  let workedHours = null;
  const wh = flat.match(/\b(\d{1,2}[.,]\d{1,2})\b/);
  if (wh) workedHours = Number(wh[1].replace(",", "."));

  const app = /timemark/i.test(flat) ? "timemark" : null;

  let time = null;
  let tm = flat.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?/i);
  if (tm) {
    let h = Number(tm[1]);
    const ap = tm[4].toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    time = `${pad(h)}:${tm[2]}:${tm[3] || "00"}`;
  } else {
    tm = flat.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (tm) time = `${pad(Number(tm[1]))}:${tm[2]}:${tm[3] || "00"}`;
  }

  let code = null;
  const cm = flat.match(/c[oó]digo\s+de\s+(?:foto|fol[io]*)[:\s]*([A-Z0-9]{6,})/i);
  if (cm) code = cm[1].toUpperCase();

  // Ubicación: líneas con dirección (número + letras, colonia/avenida, CP de 5 dígitos).
  const locLines = (lines || [])
    .map((l) => l.trim())
    .filter((l) => l.length >= 6)
    .filter((l) => !/^\d{1,2}:\d{2}/.test(l) && !/\bde\s+[a-záé]{3,}\.?\s*\d{4}\b/i.test(l))
    .filter((l) => /\d/.test(l) && /[a-záéíóúñ]{3,}/i.test(l))
    .filter((l) => /(avenida|av\.?\b|calle|ciudad|col\.?\b|colonia|no\.?\b|pante[oó]n|m[eé]xico|cdmx|\b\d{5}\b)/i.test(l));
  let location = locLines.length > 0 ? locLines.join(", ").replace(/\s{2,}/g, " ").trim() : null;

  return {
    date,
    time,
    type: inferType(caption),
    shift_in: shiftIn,
    shift_out: shiftOut,
    worked_hours: workedHours,
    location,
    code,
    app,
    raw: { text: flat.slice(0, 2000) },
  };
}
