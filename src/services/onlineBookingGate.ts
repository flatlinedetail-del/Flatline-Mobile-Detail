import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { Service } from "../types";
import {
  decideBookingGate,
  normalizeEmail as _normalizeEmail,
  normalizePhone as _normalizePhone,
  type BookingGateResult,
  type BookingMode,
  type CustomerMessageType,
} from "./onlineBookingGateCore";

// ─── Re-exports (preserves the previous public surface) ──────────────────────
// Existing callers (BookAppointment, Calendar, PublicBooking) import names
// from this module; re-exporting from the pure core keeps every import working
// without touching call sites.

export const normalizeEmail = _normalizeEmail;
export const normalizePhone = _normalizePhone;
export type { BookingMode, CustomerMessageType, BookingGateResult };

// The legacy input type used by authenticated wrappers.
export interface BookingGateInput {
  email: string;
  phone: string;
  /** Optional license plate value from the booking form. */
  licensePlate?: string;
  /** Resolved Service objects for all selected service IDs. */
  selectedServices: Service[];
  /**
   * Full customer-facing total after all adjustments:
   * serviceSubtotal + travelFee - discount + afterHoursFee.
   */
  grandTotal: number;
}

// ─── Authenticated wrapper ────────────────────────────────────────────────────

/**
 * OnlineBookingGate — Firestore-aware wrapper around the pure decision core.
 *
 * **Intended for AUTHENTICATED callers only** (internal Calendar edits,
 * desktop BookAppointment). It reads `protected_clients` and `clients` via
 * the client SDK, which enforces Firestore rules. Logged-out public users
 * cannot read `protected_clients` — those callers must use the server
 * endpoint `POST /api/booking/gate` instead. See `PublicBooking.tsx`.
 *
 * Payment note: Stripe checkout is NOT yet implemented. When `depositRequired`
 * is true the appointment is saved with `paymentStatus: "deposit_pending"`
 * and `depositPaid: false`. The owner contacts the customer manually.
 * `depositPaid` must only be set to true by a verified payment webhook
 * once Stripe is wired up.
 */
export async function runOnlineBookingGate(
  input: BookingGateInput,
): Promise<BookingGateResult> {
  const { email, phone, licensePlate, selectedServices, grandTotal } = input;

  // ── Fetch data in parallel ────────────────────────────────────────────────
  //
  // protected_clients: always fetch all — list is small (<500 entries) and
  //   security-critical. In-memory matching handles all fields.
  //
  // clients: query by normalized email (Firestore index, fast). Phone-based
  //   querying requires a stored normalized field which does not exist yet.
  const normEmail = _normalizeEmail(email);
  const pcFetch = getDocs(collection(db, "protected_clients"));
  const clientFetch =
    normEmail.length > 3
      ? getDocs(query(collection(db, "clients"), where("email", "==", normEmail)))
      : Promise.resolve(null);

  const [pcSnap, clientSnap] = await Promise.all([pcFetch, clientFetch]);

  const protectedClients = pcSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string },
  );
  const matchedClient = clientSnap && !clientSnap.empty
    ? ({ id: clientSnap.docs[0].id, ...clientSnap.docs[0].data() } as Record<string, unknown> & {
        id: string;
      })
    : null;

  // ── Delegate to the pure decision core ───────────────────────────────────
  return decideBookingGate({
    email,
    phone,
    licensePlate,
    selectedServices,
    grandTotal,
    protectedClients,
    matchedClient,
  });
}
