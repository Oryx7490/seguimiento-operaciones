export type GoalDirection = "at_least" | "at_most";
export type GoalStatus = "ok" | "warn" | "bad" | "none";

export const GOAL_METRICS: Record<string, { label: string; unit: string; direction: GoalDirection }> = {
  hours_worked: { label: "Horas trabajadas", unit: "h", direction: "at_least" },
  overtime: { label: "Horas extra (máx)", unit: "h", direction: "at_most" },
  m2_per_hour: { label: "m² por hora", unit: "m²/h", direction: "at_least" },
  m2_installed: { label: "m² instalados", unit: "m²", direction: "at_least" },
  screens_installed: { label: "Pantallas instaladas", unit: "uds", direction: "at_least" },
  tickets_closed: { label: "Tickets cerrados", unit: "uds", direction: "at_least" },
};

export interface GoalEval {
  status: GoalStatus;
  ratio: number | null;
}

/** Evalúa el avance contra la meta con semáforo (verde/ámbar/rojo). */
export function evaluateGoal(actual: number, target: number, direction: GoalDirection): GoalEval {
  if (target <= 0) return { status: "none", ratio: null };
  if (direction === "at_most") {
    const ratio = actual / target;
    if (actual <= target) return { status: "ok", ratio };
    if (actual <= target * 1.2) return { status: "warn", ratio };
    return { status: "bad", ratio };
  }
  const ratio = actual / target;
  if (actual >= target) return { status: "ok", ratio };
  if (actual >= target * 0.8) return { status: "warn", ratio };
  return { status: "bad", ratio };
}
