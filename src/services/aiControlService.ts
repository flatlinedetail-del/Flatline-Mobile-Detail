/**
 * AI Control Service
 *
 * Every AI feature must call canRunAI() before making an AI request.
 * This module also owns:
 *   - Firestore-persisted caching (ai_cache collection)
 *   - Usage logging (ai_usage_logs collection)
 *   - Data snapshot hashing for change detection
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { ModelTier } from "./aiModelMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIMode = "off" | "manual_only" | "smart_scheduled";
export type TriggerType = "manual" | "scheduled";

// TODO: there is a second AISettings declared in src/types/aiSettings.ts.
// The two shapes diverged before this slice (different field sets, different
// timestamp types). Consolidating into a single shared type would touch
// multiple consumers; deferred. For now the FormsStudio fields below are
// duplicated to keep both type declarations in sync.
export interface AISettings {
  aiEnabled: boolean;
  aiMode: AIMode;
  preferredModelTier: ModelTier;
  allowModelEscalation: boolean;
  dailyAICallLimit: number;
  weeklyAICallLimit: number;
  monthlyAICallLimit: number;
  enableDailyBusinessAdvisor: boolean;
  enableWeeklyBusinessReport: boolean;
  enableAILeadEngine: boolean;
  enableClientMessageAI: boolean;
  enableEstimateAI: boolean;
  enableRevenueIntelligenceAI: boolean;
  enableRiskExplanationAI: boolean;
  lastDailyAdvisorRunAt?: Timestamp | null;
  lastWeeklyReportRunAt?: Timestamp | null;
  lastAILeadEngineRunAt?: Timestamp | null;

  // ── FormsStudio Smart Protection automation (Phase 1, Slice 1) ─────────
  // All optional and additive. Launch default for formsAutomationMode is
  // "suggestions_only" when unset (see services/formsAutomationGate.ts).
  enableAIDocumentGeneration?: boolean;
  enableFormRecommendations?: boolean;
  enableOnlineBookingAutoAttach?: boolean;
  formsAutomationMode?: "off" | "suggestions_only" | "owner_review_required" | "online_booking_auto_attach";
  formsAITermsAcceptedVersion?: string;
  formsAITermsAcceptedAt?: Timestamp | null;
  formsAITermsAcceptedByUid?: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  aiEnabled: true,
  aiMode: "manual_only",
  preferredModelTier: "smart_saver",
  allowModelEscalation: false,
  dailyAICallLimit: 50,
  weeklyAICallLimit: 200,
  monthlyAICallLimit: 500,
  enableDailyBusinessAdvisor: false,
  enableWeeklyBusinessReport: false,
  enableAILeadEngine: true,
  enableClientMessageAI: true,
  enableEstimateAI: true,
  enableRevenueIntelligenceAI: false,
  enableRiskExplanationAI: true,
  lastDailyAdvisorRunAt: null,
  lastWeeklyReportRunAt: null,
  lastAILeadEngineRunAt: null,
};

export interface AIRunGuardResult {
  allowed: boolean;
  reason: string;
  useCachedResult: boolean;
  modelTier: ModelTier;
}

// Feature names used across the app — must match what's passed to canRunAI
export type AIFeatureName =
  | "daily_business_advisor"
  | "weekly_business_report"
  | "ai_lead_engine"
  | "client_message"
  | "estimate_notes"
  | "quote_wording"
  | "client_analysis"
  | "follow_up_message"
  | "job_summary"
  | "revenue_intelligence"
  | "risk_explanation"
  | "deep_analysis"
  | "ask_assistant"
  | "qualify_lead"
  | "receipt_analysis"
  | "revenue_optimization"
  | "deployment_analysis"
  | "smart_quote_pricing";

// ---------------------------------------------------------------------------
// Feature ↔ settings toggle mapping
// ---------------------------------------------------------------------------

function isFeatureEnabled(feature: AIFeatureName, settings: AISettings): boolean {
  switch (feature) {
    case "daily_business_advisor": return settings.enableDailyBusinessAdvisor;
    case "weekly_business_report": return settings.enableWeeklyBusinessReport;
    case "ai_lead_engine":
    case "qualify_lead":         return settings.enableAILeadEngine;
    case "client_message":
    case "follow_up_message":    return settings.enableClientMessageAI;
    case "estimate_notes":
    case "quote_wording":
    case "smart_quote_pricing":  return settings.enableEstimateAI;
    case "revenue_intelligence":
    case "revenue_optimization": return settings.enableRevenueIntelligenceAI;
    case "risk_explanation":     return settings.enableRiskExplanationAI;
    // These are always allowed if AI is on — no dedicated toggle
    case "client_analysis":
    case "job_summary":
    case "ask_assistant":
    case "receipt_analysis":
    case "deployment_analysis":
    case "deep_analysis":        return true;
    default:                     return true;
  }
}

// ---------------------------------------------------------------------------
// Usage counting
// ---------------------------------------------------------------------------

async function getUsageCounts(userId?: string): Promise<{ daily: number; weekly: number; monthly: number }> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const logsRef = collection(db, "ai_usage_logs");
    const snap = await getDocs(
      query(
        logsRef,
        where("timestamp", ">=", Timestamp.fromDate(monthStart)),
        ...(userId ? [where("userId", "==", userId)] : [])
      )
    );

    let daily = 0, weekly = 0, monthly = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      const ts: Timestamp = data.timestamp;
      if (!ts) return;
      const t = ts.toDate();
      monthly++;
      if (t >= weekStart) weekly++;
      if (t >= todayStart) daily++;
    });

    return { daily, weekly, monthly };
  } catch {
    // If logging isn't set up yet, don't block AI
    return { daily: 0, weekly: 0, monthly: 0 };
  }
}

// ---------------------------------------------------------------------------
// Run guard
// ---------------------------------------------------------------------------

export async function canRunAI(
  feature: AIFeatureName,
  trigger: TriggerType,
  settings: AISettings,
  options: {
    userId?: string;
    requestedTier?: ModelTier;
    cachedResultAvailable?: boolean;
    dataHash?: string;
    lastCachedHash?: string;
    lastRunAt?: Date | null;
  } = {}
): Promise<AIRunGuardResult> {
  const {
    userId,
    requestedTier,
    cachedResultAvailable = false,
    dataHash,
    lastCachedHash,
    lastRunAt,
  } = options;

  // 1. Master kill switch
  if (!settings.aiEnabled) {
    return {
      allowed: false,
      reason: "AI is disabled in settings.",
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }

  // 2. Mode check
  if (settings.aiMode === "off") {
    return {
      allowed: false,
      reason: "AI mode is set to Off.",
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }

  if (settings.aiMode === "manual_only" && trigger === "scheduled") {
    return {
      allowed: false,
      reason: "AI is in Manual Only mode. Scheduled AI is disabled.",
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }

  // 3. Feature toggle
  if (!isFeatureEnabled(feature, settings)) {
    return {
      allowed: false,
      reason: `${feature} is disabled in AI settings.`,
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }

  // 4. Data snapshot — skip if data hasn't changed
  if (dataHash && lastCachedHash && dataHash === lastCachedHash && cachedResultAvailable) {
    return {
      allowed: false,
      reason: "Data unchanged since last run. Using cached result.",
      useCachedResult: true,
      modelTier: settings.preferredModelTier,
    };
  }

  // 5. Cooldown guards for scheduled features
  if (trigger === "scheduled") {
    const now = Date.now();
    if (feature === "daily_business_advisor" && lastRunAt) {
      const msSinceLast = now - lastRunAt.getTime();
      if (msSinceLast < 20 * 60 * 60 * 1000) { // 20 hours
        return {
          allowed: false,
          reason: "Daily Business Advisor already ran today.",
          useCachedResult: cachedResultAvailable,
          modelTier: settings.preferredModelTier,
        };
      }
    }
    if (feature === "weekly_business_report" && lastRunAt) {
      const msSinceLast = now - lastRunAt.getTime();
      if (msSinceLast < 6 * 24 * 60 * 60 * 1000) { // 6 days
        return {
          allowed: false,
          reason: "Weekly Business Report already ran this week.",
          useCachedResult: cachedResultAvailable,
          modelTier: settings.preferredModelTier,
        };
      }
    }
    if (feature === "ai_lead_engine" && lastRunAt) {
      const msSinceLast = now - lastRunAt.getTime();
      if (msSinceLast < 20 * 60 * 60 * 1000) {
        return {
          allowed: false,
          reason: "AI Lead Engine already ran today.",
          useCachedResult: cachedResultAvailable,
          modelTier: settings.preferredModelTier,
        };
      }
    }
  }

  // 6. Usage limits
  const counts = await getUsageCounts(userId);
  if (counts.daily >= settings.dailyAICallLimit) {
    return {
      allowed: false,
      reason: `Daily AI call limit reached (${settings.dailyAICallLimit}).`,
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }
  if (counts.weekly >= settings.weeklyAICallLimit) {
    return {
      allowed: false,
      reason: `Weekly AI call limit reached (${settings.weeklyAICallLimit}).`,
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }
  if (counts.monthly >= settings.monthlyAICallLimit) {
    return {
      allowed: false,
      reason: `Monthly AI call limit reached (${settings.monthlyAICallLimit}).`,
      useCachedResult: cachedResultAvailable,
      modelTier: settings.preferredModelTier,
    };
  }

  // 7. Model tier resolution
  let modelTier: ModelTier = requestedTier ?? settings.preferredModelTier;
  // Escalation guard — if escalation not allowed, cap at preferred tier
  const tierRank: Record<ModelTier, number> = {
    smart_saver: 0,
    balanced_intelligence: 1,
    deep_strategy: 2,
  };
  if (
    !settings.allowModelEscalation &&
    tierRank[modelTier] > tierRank[settings.preferredModelTier]
  ) {
    modelTier = settings.preferredModelTier;
  }

  return {
    allowed: true,
    reason: "OK",
    useCachedResult: false,
    modelTier,
  };
}

// ---------------------------------------------------------------------------
// Usage logging
// ---------------------------------------------------------------------------

export async function logAIUsage(entry: {
  featureName: AIFeatureName;
  triggerType: TriggerType;
  allowed: boolean;
  blocked: boolean;
  reason: string;
  modelTier: ModelTier;
  modelUsed: string;
  cachedResultUsed: boolean;
  userId?: string;
  tokenEstimate?: number;
  estimatedCost?: number;
}): Promise<void> {
  try {
    await addDoc(collection(db, "ai_usage_logs"), {
      ...entry,
      timestamp: serverTimestamp(),
    });
  } catch {
    // Non-critical — never let logging failure block the app
  }
}

// ---------------------------------------------------------------------------
// Firestore AI result cache
// ---------------------------------------------------------------------------

export interface AICacheEntry {
  featureName: string;
  result: any;
  createdAt: any;
  updatedAt: any;
  lastRunAt: any;
  dataSnapshotHash: string;
  modelUsed: string;
  modelTier: ModelTier;
  triggerType: TriggerType;
  cachedResultUsed: boolean;
  tokenEstimate?: number;
  estimatedCost?: number;
}

export async function getAICache(
  featureName: string,
  dataHash?: string
): Promise<{ result: any; entry: AICacheEntry } | null> {
  try {
    const snap = await getDoc(doc(db, "ai_cache", featureName));
    if (!snap.exists()) return null;
    const entry = snap.data() as AICacheEntry;
    // If caller provides a hash and data changed, treat as cache miss
    if (dataHash && entry.dataSnapshotHash !== dataHash) return null;
    return { result: entry.result, entry };
  } catch {
    return null;
  }
}

export async function setAICache(
  featureName: string,
  result: any,
  meta: {
    dataSnapshotHash: string;
    modelUsed: string;
    modelTier: ModelTier;
    triggerType: TriggerType;
    tokenEstimate?: number;
    estimatedCost?: number;
  }
): Promise<void> {
  try {
    await setDoc(
      doc(db, "ai_cache", featureName),
      {
        featureName,
        result,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastRunAt: serverTimestamp(),
        dataSnapshotHash: meta.dataSnapshotHash,
        modelUsed: meta.modelUsed,
        modelTier: meta.modelTier,
        triggerType: meta.triggerType,
        cachedResultUsed: false,
        ...(meta.tokenEstimate != null && { tokenEstimate: meta.tokenEstimate }),
        ...(meta.estimatedCost != null && { estimatedCost: meta.estimatedCost }),
      },
      { merge: true }
    );
  } catch {
    // Non-critical
  }
}

// ---------------------------------------------------------------------------
// Data snapshot hashing (lightweight, no crypto dep needed)
// ---------------------------------------------------------------------------

export function hashSnapshot(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

// ---------------------------------------------------------------------------
// AI settings loader (reads from settings/business doc)
// ---------------------------------------------------------------------------

export async function loadAISettings(): Promise<AISettings> {
  try {
    const snap = await getDoc(doc(db, "settings", "business"));
    if (snap.exists()) {
      const data = snap.data();
      const saved = data?.aiSettings ?? {};
      return { ...DEFAULT_AI_SETTINGS, ...saved };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_AI_SETTINGS };
}

export async function saveAISettings(
  aiSettings: AISettings,
  lastRunUpdates?: Partial<Pick<AISettings, "lastDailyAdvisorRunAt" | "lastWeeklyReportRunAt" | "lastAILeadEngineRunAt">>
): Promise<void> {
  const merged = lastRunUpdates ? { ...aiSettings, ...lastRunUpdates } : aiSettings;
  await setDoc(
    doc(db, "settings", "business"),
    { aiSettings: merged },
    { merge: true }
  );
}

// ---------------------------------------------------------------------------
// Usage summary (for settings UI display)
// ---------------------------------------------------------------------------

export async function getAIUsageSummary(userId?: string): Promise<{
  today: number;
  week: number;
  month: number;
}> {
  const counts = await getUsageCounts(userId);
  return { today: counts.daily, week: counts.weekly, month: counts.monthly };
}
