/**
 * Package Deal / Recommendation acceptance lifecycle.
 *
 * Owns the three outcomes for skipped recommendations and bundle suggestions
 * surfaced on quotes/invoices/jobs:
 *   - accepted_today      → becomes billable on the current document
 *   - accepted_next_detail → applied to a future appointment
 *   - declined             → kept non-billable, visible as recommendation
 *
 * Storage rule: status lives ON the bundle/recommendation entry inside the
 * existing unacceptedBundles / recommendedItems / unacceptedRecommendations
 * arrays — no separate collection. This keeps the audit trail attached to the
 * source document without inventing a parallel system.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export type RecommendationStatus =
  | "pending"
  | "accepted_today"
  | "accepted_next_detail"
  | "declined";

export type RecommendationKind = "bundle" | "recommendation";

export type DocumentTarget =
  | { collection: "quotes"; id: string }
  | { collection: "invoices"; id: string }
  | { collection: "appointments"; id: string };

export interface PackageStatusUpdate {
  status: RecommendationStatus;
  acceptedAt?: Timestamp | any;
  declinedAt?: Timestamp | any;
  acceptedForAppointmentId?: string | null;
  selectedRecurringOccurrenceDate?: Timestamp | any;
  scheduledForFutureDetail?: boolean;
  relatedVehicleId?: string | null;
  packageDealId?: string | null;
  reason?: string;
}

const norm = (s: any) => String(s || "").toLowerCase().trim();

/**
 * Update the status of a single bundle or recommendation entry on its source
 * document by matching name (case-insensitive). Mutates the array in place
 * and writes back.
 *
 * Bundles match on `name`; recommendations match on `serviceName`.
 */
export async function updateRecommendationStatus(
  target: DocumentTarget,
  kind: RecommendationKind,
  itemKey: string,
  patch: PackageStatusUpdate
): Promise<void> {
  const ref = doc(db, target.collection, target.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`${target.collection}/${target.id} not found`);
  const data = snap.data() as any;
  const updates: any = {};

  if (kind === "bundle") {
    const list: any[] = Array.isArray(data.unacceptedBundles) ? [...data.unacceptedBundles] : [];
    const idx = list.findIndex((b: any) => norm(b?.name) === norm(itemKey));
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch };
    updates.unacceptedBundles = list;
  } else {
    const list: any[] = Array.isArray(data.recommendedItems) ? [...data.recommendedItems] : [];
    const idx = list.findIndex((r: any) => norm(r?.serviceName) === norm(itemKey));
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch };
    updates.recommendedItems = list;
  }

  updates.updatedAt = serverTimestamp();
  await updateDoc(ref, updates);
}

export async function declineRecommendation(
  target: DocumentTarget,
  kind: RecommendationKind,
  itemKey: string,
  reason?: string
): Promise<void> {
  await updateRecommendationStatus(target, kind, itemKey, {
    status: "declined",
    declinedAt: serverTimestamp(),
    reason: reason || "",
  });
}

/**
 * Returns the next `limit` upcoming appointments for a client that are part of
 * a recurring series. Sorted by scheduledAt ascending.
 *
 * If `relatedVehicleId` is provided, recurring appointments containing that
 * vehicle are listed first (still includes others so the user can choose).
 */
export async function fetchUpcomingRecurringAppointments(
  clientId: string,
  options: { limit?: number; relatedVehicleId?: string | null } = {}
): Promise<any[]> {
  const limit = options.limit ?? 4;
  if (!clientId) return [];

  const now = new Date();
  // We can't combine multiple inequality + array-contains in a single query
  // without composite indexes, so do a broader read and filter client-side.
  const colRef = collection(db, "appointments");
  const q = query(colRef, where("clientId", "==", clientId));
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const upcoming = all.filter((a: any) => {
    if (!a.recurringInfo?.isRecurring) return false;
    const at: any = a.scheduledAt;
    if (!at) return false;
    const date = at.toDate ? at.toDate() : new Date(at);
    return date.getTime() > now.getTime() && a.status !== "canceled" && a.status !== "completed";
  });

  upcoming.sort((a: any, b: any) => {
    const da = a.scheduledAt.toDate ? a.scheduledAt.toDate().getTime() : new Date(a.scheduledAt).getTime();
    const db2 = b.scheduledAt.toDate ? b.scheduledAt.toDate().getTime() : new Date(b.scheduledAt).getTime();
    return da - db2;
  });

  if (options.relatedVehicleId) {
    const vId = options.relatedVehicleId;
    upcoming.sort((a: any, b: any) => {
      const aHas = (a.vehicleIds || [a.vehicleId]).includes(vId) ? 0 : 1;
      const bHas = (b.vehicleIds || [b.vehicleId]).includes(vId) ? 0 : 1;
      return aHas - bHas;
    });
  }

  return upcoming.slice(0, limit);
}

/**
 * Append a package as a service line on a single vehicle inside an existing
 * appointment. Other vehicles + their services are untouched.
 *
 * Returns true if the appointment was updated (vehicle was present), false if
 * the related vehicle was not in the appointment (caller should warn).
 */
export async function applyPackageToAppointment(
  appointmentId: string,
  bundle: { name: string; services?: string[]; price: number; savings?: number },
  relatedVehicleId: string | null,
  occurrenceDate?: Date | null
): Promise<{ applied: boolean; vehicleMissing: boolean }> {
  const ref = doc(db, "appointments", appointmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`appointments/${appointmentId} not found`);
  const appt = snap.data() as any;

  const vehicleIds: string[] = Array.isArray(appt.vehicleIds) ? appt.vehicleIds : (appt.vehicleId ? [appt.vehicleId] : []);
  const vehicleMissing = !!relatedVehicleId && !vehicleIds.includes(relatedVehicleId);
  if (vehicleMissing) {
    return { applied: false, vehicleMissing: true };
  }

  // Add the package as a single service-selection line bound to the related vehicle.
  const newSelection = {
    id: `pkg-${Date.now()}`,
    serviceId: `pkg_${norm(bundle.name).replace(/\s+/g, "_")}`,
    serviceName: bundle.name,
    description: `Package: ${(bundle.services || []).join(", ")}`,
    price: bundle.price,
    qty: 1,
    total: bundle.price,
    source: "package",
    protocolAccepted: true,
    vehicleId: relatedVehicleId || vehicleIds[0] || "",
    appliedAt: Timestamp.now(),
    appliedAsPackage: true,
    packageSavings: bundle.savings || 0,
  };

  const newServiceSelections = [...(appt.serviceSelections || []), newSelection];
  const newServiceNames = [...(appt.serviceNames || []), bundle.name];
  const newBaseAmount = (appt.baseAmount || 0) + bundle.price;
  const newTotalAmount = (appt.totalAmount || 0) + bundle.price;

  await updateDoc(ref, {
    serviceSelections: newServiceSelections,
    serviceNames: newServiceNames,
    baseAmount: newBaseAmount,
    totalAmount: newTotalAmount,
    internalNotes:
      (appt.internalNotes || "") +
      `\n\n[PACKAGE APPLIED] ${bundle.name} (${(bundle.services || []).join(" + ")}) @ $${bundle.price.toFixed(2)}` +
      (occurrenceDate ? ` for occurrence ${occurrenceDate.toISOString().slice(0, 10)}` : "") +
      (relatedVehicleId ? ` on vehicle ${relatedVehicleId}` : ""),
    updatedAt: serverTimestamp(),
  });

  return { applied: true, vehicleMissing: false };
}
