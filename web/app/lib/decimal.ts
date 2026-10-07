const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/;

const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TEN = BigInt(10);

interface Scaled {
  n: bigint;
  scale: number;
}

function toScaled(value: string | number | null | undefined): Scaled | null {
  if (value === null || value === undefined || value === "") return null;
  const match = DECIMAL_RE.exec(String(value).trim());
  if (!match) return null;
  const [, sign, intPart, fracPart = ""] = match;
  if (!intPart && !fracPart) return null;
  const digits = BigInt((intPart || "0") + fracPart);
  return { n: sign === "-" ? -digits : digits, scale: fracPart.length };
}

function pow10(exponent: number): bigint {
  return BIG_TEN ** BigInt(exponent);
}

function ceilDiv(num: bigint, den: bigint): number | null {
  if (den === BIG_ZERO) return null;
  const quotient = num / den;
  const remainder = num % den;
  const ceil = num > BIG_ZERO && remainder !== BIG_ZERO ? quotient + BIG_ONE : quotient;
  return Number(ceil);
}

/**
 * Módulos necesarios para cubrir un área, usando todos los decimales exactos.
 * `Math.ceil(area / modulo)` con `number` arrastra error de coma flotante
 * (p. ej. 13.000000000000002 → 14 en lugar de 13), por lo que aquí el cálculo se
 * hace con enteros escalados: los valores se leen como texto decimal y se dividen
 * con aritmética entera, sin pérdida de precisión.
 */
export function modulesForArea(
  area: string | number | null | undefined,
  quantity: number,
  moduleArea: string | number | null | undefined
): number | null {
  const a = toScaled(area);
  const b = toScaled(moduleArea);
  if (!a || !b || b.n <= BIG_ZERO) return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const numerator = a.n * BigInt(quantity) * pow10(b.scale);
  const denominator = b.n * pow10(a.scale);
  return ceilDiv(numerator, denominator);
}

/** Multiplica un decimal exacto por un entero y devuelve texto decimal exacto. */
export function multiplyDecimalText(
  value: string | number | null | undefined,
  factor: number
): string {
  const v = toScaled(value);
  if (!v || !Number.isInteger(factor)) return "0";
  return scaledText(v.n * BigInt(factor), v.scale);
}

function scaledText(n: bigint, scale: number): string {
  const negative = n < BIG_ZERO;
  const digits = (negative ? -n : n).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale) || "0";
  const fracPart = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${intPart}${fracPart.replace(/0+$/, "")}`;
}

/** Texto decimal exacto, sin notación científica ni ceros sobrantes. */
export function decimalText(value: string | number | null | undefined): string {
  const v = toScaled(value);
  return v ? scaledText(v.n, v.scale) : "0";
}
