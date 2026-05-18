/**
 * POST /api/booking/notify
 *
 * Server-side notification dispatch for public booking events.
 * Uses the Firebase Admin SDK so it bypasses Firestore security rules and
 * reliably delivers notifications regardless of the caller's auth state.
 *
 * Replaces the previous client-side createNotification() call in
 * PublicBooking.tsx, which was unreliable because:
 *   1. It ran from an unauthenticated page, subject to Firestore rules.
 *   2. The admin user query used `where("role", "==", "admin")`, missing
 *      accounts with role "owner" or "manager".
 *
 * This endpoint queries ALL admin-role variants and writes directly to
 * the `notifications` collection using admin credentials.
 *
 * The call is fire-and-forget from the client — notification failure never
 * blocks the customer-facing booking confirmation screen.
 */

import { getBookingGateAdminDb } from "../../src/server/adminFirestore.js";
import { FieldValue } from "firebase-admin/firestore";

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}
interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  json(value: unknown): VercelLikeResponse;
  end(): VercelLikeResponse;
}

const ADMIN_ROLES = ["admin", "owner", "manager"] as const;

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = getBookingGateAdminDb();
  if (!db) {
    console.error("[booking-notify] Admin DB not configured");
    return res.status(503).json({ error: "DB not configured" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const appointmentId =
    typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  const clientName =
    typeof body.clientName === "string" ? body.clientName.trim() : "Customer";
  const scheduledAt =
    typeof body.scheduledAt === "string" ? body.scheduledAt : "";
  const serviceNames =
    typeof body.serviceNames === "string" ? body.serviceNames : "";
  const bookingMode =
    typeof body.bookingMode === "string" ? body.bookingMode : "instant_confirm";
  const pendingOwnerReview = body.pendingOwnerReview === true;
  const depositRequired = body.depositRequired === true;
  const depositAmount =
    typeof body.depositAmount === "number" && body.depositAmount > 0
      ? body.depositAmount
      : 0;
  const isWaitlisted = body.isWaitlisted === true;
  const backupScheduledAt =
    typeof body.backupScheduledAt === "string" ? body.backupScheduledAt : null;

  if (!appointmentId) {
    return res.status(400).json({ error: "appointmentId is required" });
  }

  try {
    // ── Verify the appointment exists (prevents spam to this endpoint) ────
    const apptDoc = await db.collection("appointments").doc(appointmentId).get();
    if (!apptDoc.exists) {
      console.warn("[booking-notify] appointmentId not found:", appointmentId);
      return res.status(404).json({ error: "Appointment not found" });
    }

    // ── Load all admin-role users ─────────────────────────────────────────
    // Query each role separately — Firestore "in" only allows up to 10 values
    // but more importantly, some deployments have role stored differently.
    const roleSnaps = await Promise.all(
      ADMIN_ROLES.map((role) =>
        db.collection("users").where("role", "==", role).get(),
      ),
    );
    const adminDocs = roleSnaps.flatMap((snap) => snap.docs);

    if (adminDocs.length === 0) {
      console.warn("[booking-notify] no admin users found to notify");
      return res.status(200).json({ notified: 0, warning: "no_admins_found" });
    }

    // ── Build notification fields ─────────────────────────────────────────
    const isBlockBooking = bookingMode === "blocked_review";
    const hasRisk = pendingOwnerReview;

    let title: string;
    if (isBlockBooking) {
      title = "🚫 Flagged Account Booking — Review Required";
    } else if (hasRisk && depositRequired) {
      title = "⚠️ Risk Booking — Review & Deposit Required";
    } else if (hasRisk) {
      title = "⚠️ Risk Client Booking — Owner Review Required";
    } else if (depositRequired) {
      title = "⚠️ New Booking — Deposit Required";
    } else if (isWaitlisted) {
      title = "Waitlist Request";
    } else {
      title = "New Booking Request";
    }

    const depositNote = depositRequired
      ? ` — Deposit: $${depositAmount.toFixed(2)} required`
      : "";

    let scheduledDisplay = "";
    if (scheduledAt) {
      try {
        const d = new Date(scheduledAt);
        scheduledDisplay = ` — ${d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      } catch { /* ignore unparseable dates */ }
    }

    let backupDisplay = "";
    if (backupScheduledAt) {
      try {
        const d = new Date(backupScheduledAt);
        backupDisplay = ` | Backup: ${d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
      } catch { /* ignore */ }
    }

    const message = isWaitlisted
      ? `${clientName} requested a booked time and selected a backup time.${scheduledDisplay}${backupDisplay}${depositNote}`
      : `New booking from ${clientName}${scheduledDisplay} — ${serviceNames}${depositNote}`;

    const type = isWaitlisted ? "waitlist_request" : "new_booking_request";
    const priority: "high" | "medium" =
      isBlockBooking || hasRisk ? "high" : "medium";

    // ── Create one notification per admin user ────────────────────────────
    const notifBase = {
      title,
      message,
      type,
      category: "Booking Requests",
      relatedId: appointmentId,
      relatedType: "appointment",
      priority,
      clientName,
      requestedDateTime: scheduledAt ? new Date(scheduledAt) : null,
      backupDateTime: backupScheduledAt ? new Date(backupScheduledAt) : null,
      bookingRequestId: appointmentId,
      appointmentId,
      // Extra fields for admin context — not shown to customers
      bookingMode,
      pendingOwnerReview,
      depositRequired,
      depositAmount,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    };

    // Deduplicate by doc ID in case the same user has multiple role docs
    const seen = new Set<string>();
    const writes = adminDocs
      .filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      })
      .map((adminDoc) =>
        db.collection("notifications").add({
          ...notifBase,
          userId: adminDoc.id,
        }),
      );

    await Promise.all(writes);

    console.log("[booking-notify] created", writes.length, "notifications for", appointmentId);
    return res.status(200).json({ notified: writes.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[booking-notify] error:", message);
    return res.status(500).json({ error: "Failed to create notifications", details: message });
  }
}
