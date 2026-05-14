import type { Appointment } from "../types";

/**
 * Canonical forward flow for an in-progress job.
 *
 * Used today by the phone Active Job screen for its status buttons.
 * Eventually the desktop JobDetail page will adopt the same flow so
 * the planned "single primary status button + back" UX (Track A
 * follow-up) can be implemented once in `advanceStatus` /
 * `regressStatus` below and consumed everywhere.
 *
 * `canceled`, `no_show`, and `missed` are TERMINAL exits — they're
 * reached via the dedicated cancellation reason flow, not by walking
 * the linear chain. They are intentionally excluded from this array.
 */
export const FORWARD_FLOW: Appointment["status"][] = [
  "scheduled",
  "confirmed",
  "en_route",
  "in_progress",
  "completed",
  "paid",
];

/**
 * The next status in the forward flow, or `null` if already terminal or
 * the current status is off-flow (e.g. canceled, no_show, missed, or
 * one of the booking/approval substates).
 */
export function nextStatus(current: Appointment["status"]): Appointment["status"] | null {
  const idx = FORWARD_FLOW.indexOf(current);
  if (idx < 0) return null;
  if (idx >= FORWARD_FLOW.length - 1) return null;
  return FORWARD_FLOW[idx + 1];
}

/**
 * The previous status in the forward flow, or `null` if already at the
 * start or off-flow. Useful for the planned "back" button.
 */
export function prevStatus(current: Appointment["status"]): Appointment["status"] | null {
  const idx = FORWARD_FLOW.indexOf(current);
  if (idx <= 0) return null;
  return FORWARD_FLOW[idx - 1];
}

/**
 * Whether the given status is a terminal cancellation-class state.
 * Used by UI surfaces that need to hide booking intelligence and
 * forward-action buttons.
 */
export function isCancellationStatus(s: Appointment["status"]): boolean {
  return s === "canceled" || s === "no_show" || s === "missed";
}

/**
 * Field name on the appointment doc where each milestone's timestamp
 * is stored. When status moves forward we set the corresponding field;
 * when status moves backward we clear it. This keeps timing analytics
 * consistent with the visible status.
 *
 * Existing fields on the doc (depositPaidAt, cancellationTimestamp,
 * etc.) are NOT included here — those are owned by other code paths
 * (deposits, cancellations) and must not be cleared by status nav.
 */
export const STATUS_TIMESTAMP_FIELDS: Partial<Record<Appointment["status"], string>> = {
  confirmed: "confirmedAt",
  en_route: "enRouteAt",
  in_progress: "startedAt",
  completed: "completedAt",
  paid: "paidAt",
};
