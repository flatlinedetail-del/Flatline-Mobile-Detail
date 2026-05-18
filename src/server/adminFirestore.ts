/**
 * Shared firebase-admin initialiser for server-side endpoints.
 *
 * Used by:
 *   - server.ts (Express, local dev / preview)
 *   - api/booking/gate.ts        (Vercel serverless)
 *   - api/debug/protected-client-match.ts (Vercel serverless)
 *
 * Lazy-init pattern: the first call boots the admin app; subsequent calls
 * return the cached Firestore instance. Returns `null` if the service-account
 * env var is missing — callers should respond with 503 in that case so
 * `/api/booking/gate` fails safe (never instant-confirms).
 *
 * Configuration:
 *
 *   FIREBASE_SERVICE_ACCOUNT_KEY   — required. JSON-stringified service
 *                                    account credential.
 *
 *   FIRESTORE_DATABASE_ID          — optional. Named-database ID. Falls back
 *                                    to `firebase-applet-config.json` when
 *                                    unset and the config file is readable
 *                                    (so existing dev setups keep working).
 *                                    Set this on Vercel — serverless
 *                                    bundlers may not include the config
 *                                    file.
 */

import fs from "fs";
import path from "path";
import {
  initializeApp as initAdminApp,
  cert as adminCert,
  getApps as getAdminApps,
  type App as AdminApp,
} from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";

let adminInitAttempted = false;
let cachedDb: AdminFirestore | null = null;
/** Tracks why the last init attempt failed. Exposed for diagnostic 503 subcodes. */
let cachedConfigErrorCode: "KEY_MISSING" | "KEY_INVALID_JSON" | null = null;

function resolveDatabaseId(): string | undefined {
  // 1. env var wins (set this on Vercel)
  const envVal = process.env.FIRESTORE_DATABASE_ID;
  if (typeof envVal === "string" && envVal.length > 0) return envVal;

  // 2. fall back to the local applet config — works in dev where the file
  // sits at the repo root. Wrapped in try/catch because in some bundled
  // serverless environments the file won't be present.
  try {
    const candidates = [
      path.join(process.cwd(), "firebase-applet-config.json"),
      path.join(__dirname, "..", "..", "firebase-applet-config.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const config = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (typeof config.firestoreDatabaseId === "string") {
          return config.firestoreDatabaseId;
        }
      }
    }
  } catch {
    // ignore — falls back to the default database
  }
  return undefined;
}

/**
 * Get the booking-gate Firestore handle. Returns `null` when the admin SDK
 * is not configured (missing `FIREBASE_SERVICE_ACCOUNT_KEY`).
 */
export function getBookingGateAdminDb(): AdminFirestore | null {
  if (adminInitAttempted) return cachedDb;
  adminInitAttempted = true;

  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    cachedConfigErrorCode = "KEY_MISSING";
    console.warn(
      "[booking-gate] FIREBASE_SERVICE_ACCOUNT_KEY not set — admin SDK disabled. " +
        "Set this env var (and FIRESTORE_DATABASE_ID for named databases) " +
        "to enable /api/booking/gate.",
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(keyJson);
    const existing: AdminApp[] = getAdminApps();
    const app: AdminApp =
      existing.length === 0
        ? initAdminApp({ credential: adminCert(serviceAccount) }, "bookingGateApp")
        : (existing.find((a) => a.name === "bookingGateApp") ?? existing[0]);

    const databaseId = resolveDatabaseId();
    cachedDb = databaseId ? getAdminFirestore(app, databaseId) : getAdminFirestore(app);
    console.log(
      `[booking-gate] firebase-admin initialised (databaseId: ${databaseId ?? "(default)"})`,
    );
    return cachedDb;
  } catch (e) {
    cachedConfigErrorCode = "KEY_INVALID_JSON";
    console.error("[booking-gate] Failed to initialise firebase-admin:", e);
    return null;
  }
}

/**
 * Returns why `getBookingGateAdminDb()` last returned null, or null if it
 * succeeded. Used to include a diagnostic `subcode` in the 503 response so
 * callers can distinguish "key not set" from "key is malformed JSON" without
 * requiring access to Vercel function logs.
 */
export function getBookingGateConfigErrorCode(): "KEY_MISSING" | "KEY_INVALID_JSON" | null {
  return cachedConfigErrorCode;
}

/** Test seam: clears the lazy-init cache. Used by no production code. */
export function _resetAdminFirestoreCache(): void {
  adminInitAttempted = false;
  cachedDb = null;
}
