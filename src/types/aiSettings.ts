// AI Feature Control and Cost Optimization — type definitions

export type AIModelTier = "smart_saver" | "balanced_intelligence" | "deep_strategy";
export type AIMode = "off" | "manual_only" | "smart_scheduled";
export type AITriggerType = "manual" | "scheduled";

export type AIFeatureName =
  | "dailyBusinessAdvisor"
  | "weeklyBusinessReport"
  | "aiLeadEngine"
  | "clientMessageAI"
  | "estimateAI"
  | "revenueIntelligenceAI"
  | "riskExplanationAI"
  | "marketingCampaignAI"
  | "receiptAnalysisAI"
  | "jobUpsellAI"
  | "deploymentAnalysisAI"
  | "deepAnalysis";

export interface AISettings {
  aiEnabled: boolean;
  aiMode: AIMode;
  preferredModelTier: AIModelTier;
  allowModelEscalation: boolean;
  dailyAICallLimit: number;
  weeklyAICallLimit: number;
  monthlyAICallLimit: number;
  // Per-feature toggles
  enableDailyBusinessAdvisor: boolean;
  enableWeeklyBusinessReport: boolean;
  enableAILeadEngine: boolean;
  enableClientMessageAI: boolean;
  enableEstimateAI: boolean;
  enableRevenueIntelligenceAI: boolean;
  enableRiskExplanationAI: boolean;
  enableMarketingCampaignAI: boolean;
  enableReceiptAnalysisAI: boolean;
  enableJobUpsellAI: boolean;
  // Last run timestamps (ISO strings)
  lastDailyAdvisorRunAt?: string;
  lastWeeklyReportRunAt?: string;
  lastAILeadEngineRunAt?: string;
  lastRevenueIntelligenceRunAt?: string;
}

export interface AIRunGuardResult {
  allowed: boolean;
  reason: string;
  useCachedResult: boolean;
  modelTier: AIModelTier;
  cachedResult?: any;
}

export interface AICacheEntry {
  featureName: string;
  result: any;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string;
  dataSnapshotHash: string;
  modelUsed: string;
  modelTier: AIModelTier;
  triggerType: AITriggerType;
  cachedResultUsed: boolean;
  tokenEstimate?: number;
  estimatedCost?: number;
}

export interface AIUsageLog {
  featureName: string;
  triggerType: AITriggerType;
  allowed: boolean;
  blocked: boolean;
  reason: string;
  modelTier: AIModelTier;
  modelUsed: string;
  timestamp: string;
  cachedResultUsed: boolean;
  userId?: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  aiEnabled: false,
  aiMode: "manual_only",
  preferredModelTier: "smart_saver",
  allowModelEscalation: false,
  dailyAICallLimit: 20,
  weeklyAICallLimit: 80,
  monthlyAICallLimit: 250,
  enableDailyBusinessAdvisor: false,
  enableWeeklyBusinessReport: false,
  enableAILeadEngine: true,
  enableClientMessageAI: true,
  enableEstimateAI: true,
  enableRevenueIntelligenceAI: true,
  enableRiskExplanationAI: false,
  enableMarketingCampaignAI: true,
  enableReceiptAnalysisAI: true,
  enableJobUpsellAI: true,
};

// Default model tier per feature
export const FEATURE_DEFAULT_TIERS: Record<string, AIModelTier> = {
  dailyBusinessAdvisor: "smart_saver",
  weeklyBusinessReport: "balanced_intelligence",
  aiLeadEngine: "smart_saver",
  clientMessageAI: "smart_saver",
  estimateAI: "smart_saver",
  revenueIntelligenceAI: "balanced_intelligence",
  riskExplanationAI: "smart_saver",
  marketingCampaignAI: "smart_saver",
  receiptAnalysisAI: "smart_saver",
  jobUpsellAI: "smart_saver",
  deploymentAnalysisAI: "smart_saver",
  deepAnalysis: "deep_strategy",
};

// Features that may run on an automatic schedule
export const SCHEDULABLE_FEATURES = new Set<string>([
  "dailyBusinessAdvisor",
  "weeklyBusinessReport",
  "aiLeadEngine",
  "revenueIntelligenceAI",
]);

// Run at most once per calendar day (when scheduled)
export const DAILY_ONCE_FEATURES = new Set<string>([
  "dailyBusinessAdvisor",
  "aiLeadEngine",
]);

// Run at most once per calendar week (when scheduled)
export const WEEKLY_ONCE_FEATURES = new Set<string>([
  "weeklyBusinessReport",
]);
