/**
 * AI Control Service
 *
 * Central run guard for all AI features.
 * Every AI call must pass through checkAIRunGuard() before touching any model.
 *
 * Responsibilities:
 * - Enforce master on/off, mode, and per-feature toggles
 * - Enforce daily / weekly / monthly call limits
 * - Enforce once-per-day / once-per-week frequency guards for scheduled features
 * - Return cached results when the data snapshot hasn't changed
 * - Resolve the correct model tier (respecting escalation settings)
 * - Log every attempt (allowed or blocked) to the ai_usage_logs Firestore collection
 * - Cache results in sessionStorage + localStorage for fast repeat calls
 */

import { collection, addDoc, getDocs, query, where, limit, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import {
  AISettings,
  AIRunGuardResult,
  AICacheEntry,
  AIUsageLog,
  AIModelTier,
  AITriggerType,
  DEFAULT_AI_SETTINGS,
  FEATURE_DEFAULT_TIERS,
  SCHEDULABLE_FEATURES,
  DAILY_ONCE_FEATURES,
  WEEKLY_ONCE_FEATURES,
} from "../types/aiSettings";

// ---------------------------------------------------------------------------
// Model tier → actual Gemini model ID mapping
// Update these strings when new Gemini models become available.
// ---------------------------------------------------------------------------
export const MODEL_TIER_MAP: Record<AIModelTier, string> = {
  smart_saver: "gemini-2.0-flash-lite",        // cost-efficient, fast
  balanced_intelligence: "gemini-2.0-flash",   // stronger reasoning
  deep_strategy: "gemini-1.5-pro",             // highest capability, use sparingly
};

// Session-level in-memory cache (cleared on page reload)
const sessionCache = new Map<string, AICacheEntry>();

// Session-level call counter (fallback when Firestore is unavailable)
let _sessionCallCount = 0;

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------
function generateHash(data: any): string {
  const str = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(36);
}

export function generateDataHash(data: any): string {
  return generateHash(data);
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function cacheKey(featureName: string, dataHash: string): string {
  return `ai_cache__${featureName}__${dataHash}`;
}

function readLocalCache(featureName: string, dataHash: string): AICacheEntry | null {
  const key = cacheKey(featureName, dataHash);
  const memHit = sessionCache.get(key);
  if (memHit) return memHit;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: AICacheEntry = JSON.parse(raw);
    // TTL: 1 hour for manual, 24 hours for scheduled
    const maxAge = entry.triggerType === "scheduled" ? 86_400_000 : 3_600_000;
    if (Date.now() - new Date(entry.lastRunAt).getTime() > maxAge) {
      localStorage.removeItem(key);
      return null;
    }
    sessionCache.set(key, entry); // warm session cache
    return entry;
  } catch {
    return null;
  }
}

function writeLocalCache(featureName: string, dataHash: string, entry: AICacheEntry): void {
  const key = cacheKey(featureName, dataHash);
  sessionCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

// Public API for callers to store results after a successful AI call
export function cacheAIResult(
  featureName: string,
  dataSnapshot: any,
  entry: Omit<AICacheEntry, "dataSnapshotHash">
): void {
  const hash = generateHash(dataSnapshot ?? {});
  writeLocalCache(featureName, hash, { ...entry, dataSnapshotHash: hash });
}

// ---------------------------------------------------------------------------
// Call-count helpers (Firestore-backed with session fallback)
// ---------------------------------------------------------------------------
async function getCallCount(since: Date, userId?: string): Promise<number> {
  try {
    const constraints: any[] = [
      where("timestamp", ">=", since.toISOString()),
      where("allowed", "==", true),
      limit(1000),
    ];
    if (userId) constraints.push(where("userId", "==", userId));
    const snap = await getDocs(query(collection(db, "ai_usage_logs"), ...constraints));
    return snap.size;
  } catch {
    return _sessionCallCount;
  }
}

async function getDailyCallCount(userId?: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return getCallCount(startOfDay, userId);
}

async function getWeeklyCallCount(userId?: string): Promise<number> {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return getCallCount(d, userId);
}

async function getMonthlyCallCount(userId?: string): Promise<number> {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return getCallCount(d, userId);
}

// ---------------------------------------------------------------------------
// Tier utilities
// ---------------------------------------------------------------------------
function tierLevel(tier: AIModelTier): number {
  return { smart_saver: 1, balanced_intelligence: 2, deep_strategy: 3 }[tier];
}

function resolveModelTier(
  featureName: string,
  preferredTier: AIModelTier,
  forceModelTier: AIModelTier | undefined,
  allowEscalation: boolean,
  triggerType: AITriggerType
): AIModelTier {
  // Manual "Deep Analysis" button always gets deep_strategy
  if (forceModelTier === "deep_strategy" && triggerType === "manual") {
    return "deep_strategy";
  }

  let tier = forceModelTier ?? preferredTier;
  const featureMin = FEATURE_DEFAULT_TIERS[featureName];

  // If the feature needs a stronger tier and escalation is permitted, upgrade
  if (featureMin && tierLevel(featureMin) > tierLevel(tier) && allowEscalation) {
    tier = featureMin;
  }

  return tier;
}

// ---------------------------------------------------------------------------
// Core run guard
// ---------------------------------------------------------------------------
export async function checkAIRunGuard(params: {
  featureName: string;
  triggerType: AITriggerType;
  aiSettings: AISettings | null | undefined;
  dataSnapshot?: any;
  forceModelTier?: AIModelTier;
  userId?: string;
}): Promise<AIRunGuardResult> {
  const { featureName, triggerType, dataSnapshot, forceModelTier, userId } = params;
  const s = params.aiSettings ?? DEFAULT_AI_SETTINGS;
  const noop = (reason: string): AIRunGuardResult =>
    ({ allowed: false, reason, useCachedResult: false, modelTier: "smart_saver" });

  // 1. Master toggle
  if (!s.aiEnabled) return noop("AI is disabled. Enable it in AI Settings.");

  // 2. Mode guard
  if (s.aiMode === "off") return noop("AI mode is Off.");
  if (s.aiMode === "manual_only" && triggerType === "scheduled") {
    return noop("Scheduled AI is disabled. Switch mode to Smart Scheduled to allow it.");
  }

  // 3. Schedulable check
  if (triggerType === "scheduled" && !SCHEDULABLE_FEATURES.has(featureName)) {
    return noop(`'${featureName}' is manual-only and cannot run on a schedule.`);
  }

  // 4. Per-feature toggle
  const toggleMap: Record<string, boolean> = {
    dailyBusinessAdvisor: s.enableDailyBusinessAdvisor,
    weeklyBusinessReport: s.enableWeeklyBusinessReport,
    aiLeadEngine: s.enableAILeadEngine,
    clientMessageAI: s.enableClientMessageAI,
    estimateAI: s.enableEstimateAI,
    revenueIntelligenceAI: s.enableRevenueIntelligenceAI,
    riskExplanationAI: s.enableRiskExplanationAI,
    marketingCampaignAI: s.enableMarketingCampaignAI,
    receiptAnalysisAI: s.enableReceiptAnalysisAI,
    jobUpsellAI: s.enableJobUpsellAI,
    deploymentAnalysisAI: true, // always on when AI is enabled
    deepAnalysis: true,          // user-triggered, always allowed
  };
  if (toggleMap[featureName] === false) {
    return noop(`Feature '${featureName}' is disabled in AI Settings.`);
  }

  // 5. Frequency guards for scheduled features
  if (triggerType === "scheduled") {
    const now = new Date();

    if (DAILY_ONCE_FEATURES.has(featureName)) {
      const lastRunStr =
        featureName === "dailyBusinessAdvisor" ? s.lastDailyAdvisorRunAt :
        featureName === "aiLeadEngine" ? s.lastAILeadEngineRunAt : undefined;

      if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        if (lastRun.toDateString() === now.toDateString()) {
          const hash = generateHash(dataSnapshot ?? {});
          const cached = readLocalCache(featureName, hash);
          if (cached) {
            return { allowed: false, reason: "Already ran today — serving cached result.", useCachedResult: true, modelTier: s.preferredModelTier, cachedResult: cached.result };
          }
          return noop(`'${featureName}' already ran today.`);
        }
      }
    }

    if (WEEKLY_ONCE_FEATURES.has(featureName)) {
      const lastRunStr =
        featureName === "weeklyBusinessReport" ? s.lastWeeklyReportRunAt : undefined;

      if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        if (lastRun >= weekStart) {
          const hash = generateHash(dataSnapshot ?? {});
          const cached = readLocalCache(featureName, hash);
          if (cached) {
            return { allowed: false, reason: "Already ran this week — serving cached result.", useCachedResult: true, modelTier: s.preferredModelTier, cachedResult: cached.result };
          }
          return noop(`'${featureName}' already ran this week.`);
        }
      }
    }
  }

  // 6. Data-snapshot cache check (covers both manual and scheduled)
  if (dataSnapshot !== undefined) {
    const hash = generateHash(dataSnapshot);
    const cached = readLocalCache(featureName, hash);
    if (cached) {
      const modelTier = resolveModelTier(featureName, s.preferredModelTier, forceModelTier, s.allowModelEscalation, triggerType);
      return { allowed: true, reason: "Cache hit — data unchanged.", useCachedResult: true, modelTier, cachedResult: cached.result };
    }
  }

  // 7. Daily call limit
  const daily = await getDailyCallCount(userId);
  if (daily >= s.dailyAICallLimit) {
    return noop(`Daily AI call limit reached (${s.dailyAICallLimit} calls/day). Reset tomorrow.`);
  }

  // 8. Weekly call limit
  const weekly = await getWeeklyCallCount(userId);
  if (weekly >= s.weeklyAICallLimit) {
    return noop(`Weekly AI call limit reached (${s.weeklyAICallLimit} calls/week).`);
  }

  // 9. Monthly call limit
  const monthly = await getMonthlyCallCount(userId);
  if (monthly >= s.monthlyAICallLimit) {
    return noop(`Monthly AI call limit reached (${s.monthlyAICallLimit} calls/month).`);
  }

  // 10. Resolve model tier
  const modelTier = resolveModelTier(
    featureName,
    s.preferredModelTier,
    forceModelTier,
    s.allowModelEscalation,
    triggerType
  );

  return { allowed: true, reason: "OK", useCachedResult: false, modelTier };
}

// ---------------------------------------------------------------------------
// Usage logging
// ---------------------------------------------------------------------------
export async function logAIUsage(log: AIUsageLog): Promise<void> {
  if (log.allowed) _sessionCallCount++;
  try {
    await addDoc(collection(db, "ai_usage_logs"), {
      ...log,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Logging failures must never break the app
  }
}

// ---------------------------------------------------------------------------
// Convenience: get today/week/month counts for the UI
// ---------------------------------------------------------------------------
export async function getAIUsageSummary(userId?: string): Promise<{
  today: number;
  thisWeek: number;
  thisMonth: number;
}> {
  const [today, thisWeek, thisMonth] = await Promise.all([
    getDailyCallCount(userId),
    getWeeklyCallCount(userId),
    getMonthlyCallCount(userId),
  ]);
  return { today, thisWeek, thisMonth };
}

