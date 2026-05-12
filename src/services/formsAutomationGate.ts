/**
 * FormsStudio Smart Protection — automation gate.
 *
 * Pure function. Derives the booleans the UI / service layer use to decide
 * whether to show recommendations, allow AI draft generation, or auto-attach
 * forms on online booking.
 *
 * Enforcement order (top wins):
 *   1. Global kill switch  (app_config/global.aiDocumentsGloballyEnabled)
 *   2. Tenant master mode  (settings/ai.formsAutomationMode)
 *   3. Per-feature toggles (settings/ai.enableXxx)
 *   4. Terms acceptance    (only for AI document generation)
 *
 * Slice 1: deterministic recommendations DO NOT require terms acceptance.
 * Terms acceptance gates only AI document generation (Phase 2 work).
 */

import type { AISettings } from "../types/aiSettings";

export type FormsAutomationMode =
  | "off"
  | "suggestions_only"
  | "owner_review_required"
  | "online_booking_auto_attach";

export interface AppConfig {
  aiDocumentsGloballyEnabled?: boolean;
}

export interface FormsAutomationGate {
  globallyEnabled: boolean;
  tenantEnabled: boolean;
  termsAccepted: boolean;
  mode: FormsAutomationMode;
  canShowRecommendations: boolean;
  canGenerateAIDrafts: boolean;
  canAutoAttachOnBooking: boolean;
}

const DEFAULT_MODE: FormsAutomationMode = "suggestions_only";

export function getFormsAutomationGate(
  appConfig: AppConfig | null | undefined,
  aiSettings: AISettings | null | undefined,
): FormsAutomationGate {
  // 1. Global kill switch — defaults to true (enabled) when the app_config
  //    document is absent, so an unseeded environment doesn't silently
  //    disable everything. Set explicitly to `false` to disable.
  const globallyEnabled = appConfig?.aiDocumentsGloballyEnabled !== false;

  // 2. Tenant mode — default to "suggestions_only" when unset.
  const mode: FormsAutomationMode =
    (aiSettings?.formsAutomationMode as FormsAutomationMode | undefined)
    ?? DEFAULT_MODE;
  const tenantEnabled = mode !== "off";

  // 3. Per-feature toggles.
  //    Recommendations are on by default unless explicitly disabled.
  //    AI generation is off by default — explicit opt-in required.
  //    Auto-attach is off by default — explicit opt-in required.
  const recommendationsToggle =
    aiSettings?.enableFormRecommendations !== false;
  const aiGenerationToggle =
    aiSettings?.enableAIDocumentGeneration === true;
  const autoAttachToggle =
    aiSettings?.enableOnlineBookingAutoAttach === true;

  // 4. Terms acceptance — only the presence of an accepted version is
  //    required. Version-comparison policy is deferred to Phase 2 where
  //    the disclaimer modal ships.
  const termsAccepted = !!aiSettings?.formsAITermsAcceptedVersion;

  // ── Derived capabilities ────────────────────────────────────────────────
  // Deterministic recommendations: do NOT require terms acceptance.
  const canShowRecommendations =
    globallyEnabled
    && tenantEnabled
    && recommendationsToggle;

  // AI draft generation: requires global + tenant + the AI-generation
  // toggle + accepted terms. Terms acceptance is the SaaS↔tenant liability
  // gate documented in the Phase 1 plan.
  const canGenerateAIDrafts =
    globallyEnabled
    && tenantEnabled
    && aiGenerationToggle
    && termsAccepted;

  // Online-booking auto-attach: requires global + tenant + the auto-attach
  // toggle + the matching automation mode. Owner-side workflows in other
  // modes still see suggestion cards, but customer self-booking never
  // auto-attaches unless the mode explicitly opts in.
  const canAutoAttachOnBooking =
    globallyEnabled
    && tenantEnabled
    && autoAttachToggle
    && mode === "online_booking_auto_attach";

  return {
    globallyEnabled,
    tenantEnabled,
    termsAccepted,
    mode,
    canShowRecommendations,
    canGenerateAIDrafts,
    canAutoAttachOnBooking,
  };
}
