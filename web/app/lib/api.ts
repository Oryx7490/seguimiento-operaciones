import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function getParam(params: { [key: string]: string | string[] | undefined }, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  throw new Error(`Falta el parámetro ${key}`);
}

export function parseId(id: string): string | null {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRe.test(id) ? id : null;
}

export function uniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("duplicate key value");
}