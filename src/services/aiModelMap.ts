/**
 * AI Model Tier Mapping
 *
 * Internal provider model names are kept here.
 * All other code uses friendly tier labels.
 * Swap model names here without touching any feature code.
 */

export type ModelTier = "smart_saver" | "balanced_intelligence" | "deep_strategy";

// Provider model IDs — update these when Gemini releases new versions
const MODEL_MAP: Record<ModelTier, string> = {
  smart_saver: "gemini-2.5-flash",            // Fast, cost-efficient, strong
  balanced_intelligence: "gemini-2.5-flash", // Default for Smart Quote pricing
  deep_strategy: "gemini-2.5-pro-preview-06-05", // Highest capability, use sparingly
};

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  smart_saver: "Smart Saver",
  balanced_intelligence: "Balanced Intelligence",
  deep_strategy: "Deep Strategy",
};

export const MODEL_TIER_DESCRIPTIONS: Record<ModelTier, string> = {
  smart_saver:
    "Default. Strong cost-efficient model for messages, lead suggestions, daily advisor, and most tasks.",
  balanced_intelligence:
    "Deeper business judgment for weekly reports, revenue analysis, and multi-client prioritization.",
  deep_strategy:
    "Highest capability. For monthly strategy, forecasting, and deep analysis on manual request only.",
};

export function resolveModel(tier?: ModelTier | null): string {
  return MODEL_MAP[tier ?? "smart_saver"] ?? MODEL_MAP.smart_saver;
}

export function getTierFromModel(modelId: string): ModelTier {
  for (const [tier, model] of Object.entries(MODEL_MAP)) {
    if (model === modelId) return tier as ModelTier;
  }
  return "smart_saver";
}
