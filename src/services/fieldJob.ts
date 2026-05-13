import type { Appointment } from "../types";

/**
 * Lightweight adapter that maps the canonical `Appointment` document
 * (Firestore `appointments` collection, defined in src/types/index.ts)
 * into a slim "FieldJob" view-model for the phone Field Mode UI.
 *
 * This is NOT a second data store — it's a presentation adapter. All
 * reads still hit the same `appointments` collection used by Dashboard,
 * Calendar, and JobDetail. The adapter exists so the phone UI can:
 *   - show only the fields it needs
 *   - compute call/text/email/maps deep links in one place
 *   - tolerate optional fields (customerPhone/customerEmail are not in
 *     the strict Appointment type today, but exist on real docs)
 */

export type FieldJobStatus = Appointment["status"];
export type FieldJobPaymentStatus = Appointment["paymentStatus"];

export interface FieldJob {
  id: string;
  clientName: string;
  clientId?: string;
  vehicleInfo: string;
  scheduledAt: Date | null;
  serviceNames: string[];
  status: FieldJobStatus;
  paymentStatus: FieldJobPaymentStatus;
  totalAmount: number;
  // Optional contact / location fields. Empty string is normalised to
  // undefined so the UI can check with a single `if (job.phone)`.
  phone?: string;
  email?: string;
  address?: string;
  // Pre-computed deep links — undefined when the source field is missing.
  telUrl?: string;
  smsUrl?: string;
  mailtoUrl?: string;
  googleMapsUrl?: string;
  appleMapsUrl?: string;
  wazeUrl?: string;
}

/**
 * Map an `Appointment` (loose-typed as it sometimes is in the codebase)
 * into a `FieldJob`. Accepts `unknown` so callers don't need to assert
 * — the function safely extracts fields it knows might be missing.
 */
export function toFieldJob(raw: Appointment | (Partial<Appointment> & Record<string, unknown>)): FieldJob {
  const r = raw as Partial<Appointment> & Record<string, unknown>;

  // Normalise empty strings to undefined.
  const phoneRaw = (r.customerPhone as string | undefined) || undefined;
  const phone = phoneRaw && phoneRaw.trim() ? phoneRaw.trim() : undefined;

  const emailRaw = (r.customerEmail as string | undefined) || undefined;
  const email = emailRaw && emailRaw.trim() ? emailRaw.trim() : undefined;

  const address = r.address && String(r.address).trim() ? String(r.address).trim() : undefined;

  // Firestore Timestamps have `.toDate()`. Defend against shapes that
  // already arrived as a plain Date (e.g. mocked data).
  let scheduledAt: Date | null = null;
  const ts = r.scheduledAt as { toDate?: () => Date } | Date | undefined;
  if (ts) {
    if (ts instanceof Date) scheduledAt = ts;
    else if (typeof ts.toDate === "function") scheduledAt = ts.toDate();
  }

  const enc = (v: string) => encodeURIComponent(v);

  return {
    id: String(r.id ?? ""),
    clientName: String(r.customerName ?? "Unknown client"),
    clientId: (r.clientId as string | undefined) || (r.customerId as string | undefined) || undefined,
    vehicleInfo: String(r.vehicleInfo ?? ""),
    scheduledAt,
    serviceNames: Array.isArray(r.serviceNames) ? (r.serviceNames as string[]) : [],
    status: (r.status as FieldJobStatus) ?? "scheduled",
    paymentStatus: (r.paymentStatus as FieldJobPaymentStatus) ?? "unpaid",
    totalAmount: typeof r.totalAmount === "number" ? (r.totalAmount as number) : 0,
    phone,
    email,
    address,
    telUrl: phone ? `tel:${phone}` : undefined,
    smsUrl: phone ? `sms:${phone}` : undefined,
    mailtoUrl: email ? `mailto:${email}` : undefined,
    googleMapsUrl: address ? `https://www.google.com/maps/dir/?api=1&destination=${enc(address)}` : undefined,
    appleMapsUrl: address ? `https://maps.apple.com/?daddr=${enc(address)}` : undefined,
    wazeUrl: address ? `https://waze.com/ul?q=${enc(address)}&navigate=yes` : undefined,
  };
}

/**
 * Friendly time label, e.g. "9:30 AM". Returns "—" if no time.
 */
export function formatJobTime(d: Date | null): string {
  if (!d) return "—";
  try {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * Friendly status label for badges.
 */
export function statusLabel(s: FieldJobStatus): string {
  switch (s) {
    case "scheduled": return "Scheduled";
    case "confirmed": return "Confirmed";
    case "en_route": return "En Route";
    case "in_progress": return "In Progress";
    case "completed": return "Completed";
    case "paid": return "Paid";
    case "canceled": return "Canceled";
    case "suggested": return "Suggested";
    case "requested": return "Requested";
    case "pending_approval": return "Pending Approval";
    case "approved": return "Approved";
    case "declined": return "Declined";
    case "reschedule_suggested": return "Reschedule";
    default: return String(s);
  }
}
