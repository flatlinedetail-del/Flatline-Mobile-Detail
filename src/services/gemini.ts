import { GoogleGenAI, Type } from "@google/genai";
import { generateRecommendationExplanation } from "../lib/recommendationSystem";
import { resolveModel, type ModelTier } from "./aiModelMap";

const _geminiKey = process.env.GEMINI_API_KEY ?? "";
if (_geminiKey) {
  const masked = _geminiKey.slice(0, 6) + "..." + _geminiKey.slice(-4);
  console.log(`[Gemini] API key loaded: ${masked} (${_geminiKey.length} chars)`);
} else {
  console.error("[Gemini] API key is missing — all AI calls will fail.");
}
const ai = new GoogleGenAI({ apiKey: _geminiKey });
// Fallback model used when no tier is passed (keeps backward compatibility)
const DEFAULT_MODEL = resolveModel("smart_saver");

// Cache for AI results
const aiCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Guard against multiple simultaneous requests
let activeRequestCount = 0;
const MAX_CONCURRENT_REQUESTS = 1; // Strictly enforce one at a time for quota safety

// Bounded wait for an in-flight slot — never let callers queue indefinitely.
// If we can't get a slot in this window, throw a clear "AI busy" error and
// let the caller render its fallback instead of spinning.
const SLOT_WAIT_MS = 2000;

// Default per-call timeout. Field workflows must not hang. Each AI function
// passes its own value; this is the floor used when none is provided.
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * AITimeoutError — thrown when an individual AI request exceeds its
 * per-feature timeout. Marked with `isTimeout` so callers (and the retry
 * layer) can distinguish it from quota / transient-503 errors.
 */
export class AITimeoutError extends Error {
  readonly isTimeout = true;
  constructor(public fnName: string, public timeoutMs: number) {
    super(
      `AI request timed out after ${(timeoutMs / 1000).toFixed(0)}s (${fnName}). Using fallback — you can retry.`
    );
    this.name = "AITimeoutError";
  }
}

/**
 * Race a promise against a hard deadline. The underlying SDK request will
 * keep running until the network resolves it (the SDK has no abort hook),
 * but the caller is unblocked at the deadline so the UI can show fallback.
 */
function withTimeout<T>(p: Promise<T>, timeoutMs: number, fnName: string): Promise<T> {
  let timer: any;
  const cancel = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AITimeoutError(fnName, timeoutMs)), timeoutMs);
  });
  return Promise.race([p, cancel]).finally(() => clearTimeout(timer));
}

function getCacheKey(fnName: string, args: any[]): string {
  return `${fnName}:${JSON.stringify(args)}`;
}

function getFromCache(key: string) {
  const cached = aiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[AI Cache] Hit for ${key}`);
    return cached.result;
  }
  return null;
}

function setToCache(key: string, result: any) {
  aiCache.set(key, { result, timestamp: Date.now() });
}

export interface AIResponse {
  intent: "schedule" | "quote" | "search" | "report" | "marketing" | "scaling" | "other";
  entities: {
    customerName?: string;
    vehicleInfo?: string;
    vin?: string;
    roNumber?: string;
    serviceType?: string;
    date?: string;
    time?: string;
    amount?: number;
    query?: string;
  };
  suggestion: string;
  suggestedActions?: string[];
  campaigns?: {
    title: string;
    targetAudience: string;
    messageAngle: string;
    offer: string;
    channel: string;
    timing: string;
    goal: string;
    coupon?: {
      code: string;
      discountType: "percentage" | "fixed" | "free_addon";
      discountValue: number;
      expiryDays?: number;
    };
    socialMedia: {
      reelIdea: string;
      caption: string;
      hook: string;
      cta: string;
      storyIdea: string;
      hashtags: string[];
    };
  }[];
  scalingInsights?: {
    finding: string;
    recommendation: string;
    impact: string;
  }[];
}

export interface ReceiptData {
  vendor: string;
  date: string;
  totalAmount: number;
  subtotal?: number;
  tax?: number;
  categorySuggestion: string;
  confidence: number;
}

export interface UpsellRecommendation {
  serviceName: string;
  reason: string;
  priceRange: string;
  recommendedPrice: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 3000,
  attempt = 1,
  fnName = "unknown",
  args: any[] = [],
  modelId = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const cacheKey = getCacheKey(fnName, args);
  const cachedResult = getFromCache(cacheKey);
  if (cachedResult) return cachedResult;

  // Bounded wait for an in-flight slot. If another AI call is hung we don't
  // want this one to block the user as well — give up after SLOT_WAIT_MS and
  // surface a clear error so the caller renders its fallback.
  let slotWaited = 0;
  while (activeRequestCount >= MAX_CONCURRENT_REQUESTS && slotWaited < SLOT_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, 200));
    slotWaited += 200;
  }
  if (activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
    console.warn(`[AI Guard] Slot wait exceeded for ${fnName} after ${SLOT_WAIT_MS}ms. Releasing caller.`);
    throw new Error(`AI busy: another request is in flight. Please retry in a moment.`);
  }

  activeRequestCount++;
  console.log(`[AI Request] ${fnName} | Attempt ${attempt} | Model: ${modelId} | Timeout: ${timeoutMs}ms`);

  try {
    // Hard timeout — caller is unblocked at the deadline even if the SDK
    // request continues in the background. The AI call NEVER hangs the UI.
    const result = await withTimeout(fn(), timeoutMs, fnName);
    setToCache(cacheKey, result);
    return result;
  } catch (error: any) {
    // Handle both string status and numeric code, including nested structures
    const errObj = error.error || error;
    const code = Number(errObj.code || error.status || error.code || 0);
    const message = String(errObj.message || error.message || "").toLowerCase();
    const status = String(errObj.status || "").toUpperCase();
    const name = String(error.name || "").toLowerCase();

    // Timeout: do NOT retry. Retrying makes the user wait even longer; field
    // UX expects fast fallback. Caller will show "Retry AI" if they want.
    if (error?.isTimeout || error instanceof AITimeoutError || name === "aitimeouterror") {
      console.warn(`[AI Timeout] ${fnName} exceeded ${timeoutMs}ms — surfacing fallback.`);
      throw error;
    }

    const isUnavailable = status === "UNAVAILABLE" ||
                          code === 503 ||
                          code === 500 ||
                          error.status === 503 ||
                          error.status === 500 ||
                          name === "apierror" ||
                          message.includes("high demand") ||
                          message.includes("internal server error") ||
                          message.includes("unavailable") ||
                          message.includes("deadline exceeded");

    const isQuotaExceeded = status === "RESOURCE_EXHAUSTED" ||
                            code === 429 ||
                            message.includes("spending cap") ||
                            message.includes("quota exceeded");

    if (isQuotaExceeded) {
      console.error(`[AI Quota] Resource Exhausted on ${fnName}`);
      throw new Error("QUOTA_EXCEEDED: Your Gemini API spending cap has been reached. Please visit https://ai.studio/spend to manage your project limits.");
    }

    if (retries > 0 && isUnavailable) {
      const nextDelay = delay + Math.random() * 2000;
      console.warn(`[AI Retry] Busy (${code || status || name}), retrying in ${Math.round(nextDelay)}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      // NOTE: forward modelId AND timeoutMs so the retry inherits the same
      // per-feature deadline instead of resetting to the wrapper default.
      return withRetry(fn, retries - 1, delay * 2, attempt + 1, fnName, args, modelId, timeoutMs);
    }

    // Only log as error on the final failure
    console.error(`[AI Failure] ${fnName} Final Failure (Attempt ${attempt}):`, JSON.stringify(error));
    throw error;
  } finally {
    activeRequestCount--;
  }
}

/**
 * Per-feature timeout policy (milliseconds). Centralised so every AI feature
 * has an explicit, field-tested deadline rather than relying on SDK defaults.
 *
 * Tunable knobs — adjust if a specific feature needs more/less time.
 */
const TIMEOUTS = {
  qualifyLeadAI: 8000,           // Lead qualification — single targeted prompt
  askAssistant_quick: 5000,      // Suggested replies / quick chat
  askAssistant_deep: 25000,      // Marketing strategy / business advisor
  analyzeReceipt: 12000,         // Image OCR — slower than text
  getRevenueOptimization: 12000, // Smart Quote primary path (may include images)
  getQuotePricingFast: 6000,     // Smart Quote fast-path: pricing tiers only, target 3–6s
  analyzeDeployment: 12000,      // Diagnostics
} as const;

/**
 * Qualifies a lead and generates outreach content
 */
export async function qualifyLeadAI(lead: any, modelTier?: ModelTier): Promise<{
  aiScore: number;
  aiClassification: string;
  aiValueEstimate: number;
  aiRecommendedAction: string;
  aiOutreachDrafts: { sms: string, email: string, callScript: string };
}> {
  const _modelId = resolveModel(modelTier);
  return withRetry(async () => {
    const isCollisionCenter = lead.businessType === "collision_center" ||
                             (lead.name && lead.name.toLowerCase().includes("collision")) ||
                             (lead.name && lead.name.toLowerCase().includes("body shop"));

    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [{
        role: "user",
        parts: [{ text: `Qualify this lead for a mobile detailing business:
          Name: ${lead.name}
          Type: ${lead.businessType || lead.aiClassification || "Unknown"}
          Address: ${lead.address}
          Website: ${lead.businessWebsite || "N/A"}
          Source: ${lead.source}
          Internal Type: ${lead.internalSourceType || "N/A"}
          Distance from Base: ${lead.distanceFromBase ? `${lead.distanceFromBase.toFixed(1)} miles` : "Unknown"}
          Notes/History: ${lead.notes || "None"}
          
          Return JSON with:
          - aiScore (0-100)
          - aiClassification (STRICT RULES BELOW)
          - aiValueEstimate (estimated per-job value in dollars)
          - aiRecommendedAction (specific next step)
          - aiOutreachDrafts (sms, email, callScript)

          STRICT CLASSIFICATION RULES:
          1. IF lead is internal (isInternal: true) AND inactive:
             - Classify as: "Reactivation Lead".
          2. IF lead is an individual (e.g., "John Doe", "Sarah Smith") AND no business indicators:
             - IF aiScore > 85: Classify as "High Value Client".
             - ELSE: Classify as "Retail Client".
          3. IF name/source contains "Collision", "Body Shop", "Paint & Body", "Autobody":
             - Classify as: "Collision Center".
          4. IF name/source contains "Dealer", "Motors", "Auto Group", "Toyota", "Ford", "Honda", "Chevrolet", "Nissan":
             - Classify as: "Dealership".
          5. IF name/source contains "Fleet", "Logistics", "Transport", "Delivery", "Trucking", "Freight", "Cargo":
             - Classify as: "Fleet".
          6. IF it is a business (contains "Inc", "LLC", "Co", "Corp", "Services") but not one of the above:
             - Classify as: "Commercial Account".
          7. IF uncertain or data is minimal:
             - Classify as: "Unclassified Lead".
          8. CRITICAL: NEVER classify as "Fleet" or "High-Volume Fleet" unless the business name or source explicitly mentions fleet, logistics, or trucking. Do not assume high-volume based on business size alone.
          9. DO NOT use generic tags like "Strategic Partner" or "Premium Retail" unless they fit the above categories. Use ONLY the categories listed in rules 1-7.

          SCORING & VALUE RULES:
          - Score (0-100): High for proximity (<15 miles), business accounts, and internal reactivation.
          - Value Estimate: 
            - Retail: $150 - $450
            - Business/Collision/Fleet: $300 - $1500+ (depending on scale)
          
          NEXT ACTION RULES:
          - Retail/Reactivation: Text outreach, promotional offer, or maintenance reminder.
          - Business/Collision/Fleet: Phone call or in-person visit. Pitch specialized services (Mold, Water, Bio, Odor) or partnership.
          ` }] 
      }],
      config: {
        systemInstruction: `You are a world-class sales strategist for DetailFlow Operations OS.
        
        ${isCollisionCenter ? `
        SPECIAL STRATEGY FOR COLLISION CENTERS / BODY SHOPS:
        1. POSITIONING: Do NOT present as a general detailer. Position as a SPECIALIST for advanced jobs that go beyond standard in-house detailing.
        2. ACKNOWLEDGMENT: Acknowledge that they likely have in-house detailers for standard work.
        3. SERVICES: Focus on high-value, specialized services: Water Damage Cleanup, Mold Remediation, Biohazard Cleanup, Advanced Odor Removal, and Headliner Restoration.
        4. VALUE PROP: We handle the "problem cars" that slow down their production line or require specialized equipment/chemicals they don't stock.
        5. LOW FRICTION: Emphasize "on-demand support" with "no contracts required."
        
        OUTREACH STRUCTURE:
        - Opening: Acknowledge their operation as a collision center/body shop.
        - Positioning: State we handle work beyond standard detailing.
        - Differentiation: List the high-value services (mold, water, bio, odor).
        - Friction: Mention no contracts/on-demand.
        - CTA: Ask for the right contact person or next step.
        ` : `
        GENERAL STRATEGY:
        - Focus on convenience, quality, and professional reliability.
        - For retail: Focus on "like-new" results and ceramic protection.
        - For fleet: Focus on brand image and vehicle longevity.
        `}
        
        Tone: Professional, confident, value-driven, and natural. Avoid sounding generic or spammy.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiScore: { type: Type.NUMBER },
            aiClassification: { type: Type.STRING },
            aiValueEstimate: { type: Type.NUMBER },
            aiRecommendedAction: { type: Type.STRING },
            aiOutreachDrafts: {
              type: Type.OBJECT,
              properties: {
                sms: { type: Type.STRING },
                email: { type: Type.STRING },
                callScript: { type: Type.STRING }
              },
              required: ["sms", "email", "callScript"]
            }
          },
          required: ["aiScore", "aiClassification", "aiValueEstimate", "aiRecommendedAction", "aiOutreachDrafts"]
        }
      }
    });

    return JSON.parse(response.text);
  }, 2, 3000, 1, "qualifyLeadAI", [(lead.id || lead.name)], _modelId, TIMEOUTS.qualifyLeadAI);
}

/**
 * AI Assistant Integration Logic
 * Extracts structured data from natural language input
 */
export async function askAssistant(input: string, context?: any, modelTier?: ModelTier): Promise<AIResponse> {
  const _modelId = resolveModel(modelTier);
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [{ role: "user", parts: [{ text: `Context: ${JSON.stringify(context)}\n\nUser Request: ${input}` }] }],
      config: {
        systemInstruction: `You are a world-class business consultant, marketing director, and AI assistant for DetailFlow Operations OS.
        
        Your goals:
        1. Answer business questions accurately using the provided context.
        2. Act as a full marketing team: Generate aggressive, high-impact scaling recommendations and specific, multi-channel marketing campaigns.
        3. Extract structured data for scheduling, quotes, or searching.
        
        Weather-Aware Marketing:
        - Use the provided weather context to adapt your recommendations.
        - Rain/Drizzle: Push interior services, odor removal, mold inspection, and maintenance reminders.
        - Clear/Sunny: Push exterior washes, waxes, ceramic coatings, and premium shine packages.
        - Pollen: Push exterior decontamination and washes.
        - Cold: Push interior protection and salt removal.
        - Heat: Push UV protection and interior refresh.
        
        Social Media Engine:
        - For EVERY campaign, generate a complete social media strategy including a Reel idea, Hook, Caption, CTA, and Story idea.
        - Content must be weather-appropriate and highly engaging.
        
        Coupon Generation:
        - If a campaign includes a discount or specific offer (e.g., "10% off", "$20 off", "Free add-on"), generate a matching 'coupon' object.
        - The 'code' should be catchy, readable, and match the theme (e.g., RAIN10, VIP25, SPRING20).
        - 'discountType' must be one of: "percentage", "fixed", "free_addon".
        - 'discountValue' should be the number (e.g., 10 for 10%, 25 for $25). For "free_addon", use 0 or a representative value.
        - 'expiryDays' should be a reasonable window (e.g., 7, 14, 30).
        
        Marketing & Scaling Strategy (BE AGGRESSIVE):
        - Retention: Reactivate inactive clients (90+ days) with "We Miss You" high-value offers. Promote recurring maintenance plans as the default choice.
        - Acquisition: Neighborhood domination (EDDM), strategic partnerships with local dealerships/collision centers, and aggressive SEO/Social targeting.
        - Collision Center Strategy: When targeting body shops/collision centers, position as a SPECIALIST for advanced overflow (Mold, Water, Bio, Odor, Headliners). Acknowledge their in-house team but offer on-demand support for "problem cars" with no contracts.
        - Upselling: Never just sell a wash. Always push high-margin Ceramic Coatings, Paint Correction, and Interior Restoration.
        - Scaling: Identify every single schedule gap and suggest dynamic pricing or "Flash Sale" campaigns to fill them. Target high-net-worth segments and fleet accounts for stable, high-volume revenue.
        - Revenue Gaps: Analyze the business context to find where money is being left on the table (e.g., slow Tuesdays, low upsell rate, high churn) and provide immediate tactical fixes.
        
        Response Format:
        - Always return a JSON object.
        - For marketing/scaling requests, generate MINIMUM 5 CAMPAIGNS.
        - Populate the 'campaigns' and 'scalingInsights' arrays with specific, actionable data.
        - 'suggestion' should be a professional summary of your analysis.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING, enum: ["schedule", "quote", "search", "report", "marketing", "scaling", "other"] },
            entities: {
              type: Type.OBJECT,
              properties: {
                customerName: { type: Type.STRING },
                vehicleInfo: { type: Type.STRING },
                vin: { type: Type.STRING },
                roNumber: { type: Type.STRING },
                serviceType: { type: Type.STRING },
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                query: { type: Type.STRING }
              }
            },
            suggestion: { type: Type.STRING },
            suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            campaigns: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  targetAudience: { type: Type.STRING },
                  messageAngle: { type: Type.STRING },
                  offer: { type: Type.STRING },
                  channel: { type: Type.STRING },
                  timing: { type: Type.STRING },
                  goal: { type: Type.STRING },
                  coupon: {
                    type: Type.OBJECT,
                    properties: {
                      code: { type: Type.STRING },
                      discountType: { type: Type.STRING, enum: ["percentage", "fixed", "free_addon"] },
                      discountValue: { type: Type.NUMBER },
                      expiryDays: { type: Type.NUMBER }
                    },
                    required: ["code", "discountType", "discountValue"]
                  },
                  socialMedia: {
                    type: Type.OBJECT,
                    properties: {
                      reelIdea: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      hook: { type: Type.STRING },
                      cta: { type: Type.STRING },
                      storyIdea: { type: Type.STRING },
                      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["reelIdea", "caption", "hook", "cta", "storyIdea", "hashtags"]
                  }
                },
                required: ["title", "targetAudience", "messageAngle", "offer", "channel", "timing", "goal", "socialMedia"]
              }
            },
            scalingInsights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  finding: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                  impact: { type: Type.STRING }
                }
              }
            }
          },
          required: ["intent", "entities", "suggestion", "suggestedActions"]
        }
      }
    });

    return JSON.parse(response.text);
  }, 2, 3000, 1, "askAssistant", [input, context], _modelId,
     modelTier === "deep_strategy" ? TIMEOUTS.askAssistant_deep : TIMEOUTS.askAssistant_quick);
}

/**
 * Receipt Analysis Logic
 * Extracts data from receipt images
 */
export async function analyzeReceipt(base64Data: string, modelTier?: ModelTier): Promise<ReceiptData> {
  const _modelId = resolveModel(modelTier);
  const mimeType = base64Data.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
  const base64 = base64Data.split(",")[1] || base64Data;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this receipt and extract the vendor name, date, total amount, subtotal, tax, and suggest a business expense category (e.g., fuel, supplies, marketing, insurance, maintenance, other). Return as JSON." },
            {
              inlineData: {
                mimeType,
                data: base64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor: { type: Type.STRING },
            date: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            subtotal: { type: Type.NUMBER },
            tax: { type: Type.NUMBER },
            categorySuggestion: { type: Type.STRING },
            confidence: { type: Type.NUMBER }
          },
          required: ["vendor", "date", "totalAmount", "categorySuggestion", "confidence"]
        }
      }
    });

    return JSON.parse(response.text);
  }, 2, 3000, 1, "analyzeReceipt", [base64.slice(0, 50)], _modelId, TIMEOUTS.analyzeReceipt);
}

export interface UpsellRecommendation {
  serviceName: string;
  reason: string;
  recommendationType?: "observed" | "maintenance_due" | "preventative";
  conditionLevel?: "light" | "moderate" | "heavy";
  priceRange: string;
  recommendedPrice: number;
  originalPrice?: number;
  bundlePrice?: number;
  requiresProductCost: boolean;
  recommendedProduct?: string;
  productReason?: string;
}

export interface PricingAnalysis {
  laborTarget: number;
  overhead: number;
  travelFee: number;
  totalProductCost: number;
  floorPrice: number;
  recommendedPrice: number;
  premiumPrice: number;
  estimatedMarginDollars: number;
  estimatedMarginPercent: number;
  netAfterProductCost: number;
}

export interface RevenueOptimizationResponse {
  recommendedUpsells: UpsellRecommendation[];
  pricingAdjustments?: {
    targetServiceName: string;
    reason: string;
    suggestedRange: string;
    suggestedPrice: number;
    impact: string;
  }[];
  bundlingOpportunities?: {
    bundleName: string;
    items: string[];
    discountedPrice: number;
    savings: number;
  }[];
  customerSpecificSuggestions?: {
    suggestion: string;
    logic: string;
  }[];
  pricingAnalysis?: PricingAnalysis;
}

/**
 * Revenue Generation Protocol Logic
 * Optimizes job revenue based on technician assessment and job data
 */
export async function getRevenueOptimization(
  assessment: string,
  jobData: {
    services: string[];
    addOns: string[];
    totalPrice: number;
    vehicle: { year?: string; make?: string; model?: string; size?: string };
    customerType: string;
    travelFee?: number;
  },
  productCosts: any[] = [],
  settings: any = {},
  images: string[] = [],
  modelTier?: ModelTier
): Promise<RevenueOptimizationResponse> {
  const _modelId = resolveModel(modelTier ?? "balanced_intelligence");
  if ((import.meta as any).env?.DEV) {
    console.log(`[AI Protocol] request: ${jobData.services.length} services, ${jobData.addOns.length} add-ons, ${productCosts.length} product cost lines, ${images.length} images`);
  }

  return withRetry(async () => {
    const totalProductCost = productCosts.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const travelFee = jobData.travelFee || 0;
    const marginTargets = settings.marginTargets || { floor: 20, recommended: 35, premium: 50 };

    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [{ 
        role: "user", 
        parts: [
          { text: `Act as a Detailing Revenue Strategist. Analyze this vehicle assessment and job data to identify revenue gains and protected pricing.
        
        Assessed Condition: "${assessment}"
        Current Job Specs: ${JSON.stringify(jobData, null, 2)}
        
        INTERNAL COST DATA:
        - Total Product Cost: $${totalProductCost}
        - Travel Fee: $${travelFee}
        - Margin Targets: Floor ${marginTargets.floor}%, Recommended ${marginTargets.recommended}%, Premium ${marginTargets.premium}%
        
        Required Analysis:
        1. Recommended Upsells: Specific high-margin Smart Add-Ons based on the vehicle condition and job context. Do not invent generic filler. Use logic reflecting real-world enhancement add-ons.
           - CRITICAL: Provide 'recommendationType' (observed, maintenance_due, or preventative). 
           - Provide 'conditionLevel' (light, moderate, or heavy) if it is observed.
           - Provide 'originalPrice' (standard retail price) and 'bundlePrice' (discounted price for today) instead of a generic price. The 'recommendedPrice' should equal the 'bundlePrice'.
           - CRITICAL: For each recommended upsell, if a specific detailing product or tool is applicable, provide the 'recommendedProduct' and a short 'productReason' explaining why it fits the task. If no specific product is needed, omit these fields.
        2. Pricing Adjustments: Identify specific items in the 'services' or 'addOns' list that should have their price adjusted due to complexity, time, OR high product usage.
        3. Bundling Opportunities: Combinations to increase ticket size.
        4. Profit-Protected Pricing Tiers: Calculate 3 pricing tiers (floor, recommended, premium) for the ENTIRE job base amount using this formula: (Labor + Overhead + Travel + Product Cost) / (1 - Target Margin %). 
           - For this calculation, assume Labor + Overhead is roughly 45% of the current service base price if not specified.
           - Ensure the Recommended Price is balanced and the Premium Price reflects absolute maximum quality/protection.
        5. Detailed display metrics: total product cost, estimated gross revenue (using recommended price), estimated margin dollars, estimated margin percentage, net after product cost.

        Return a JSON object matching the requested schema.` },
          ...images.map(img => {
            const isBase64 = img.includes('base64,');
            const mimeType = isBase64 ? img.split(';')[0].split(':')[1] : 'image/jpeg';
            const data = isBase64 ? img.split('base64,')[1] : img;
            return {
              inlineData: {
                data,
                mimeType
              }
            };
          })
        ] 
      }],
      config: {
        systemInstruction: `You are a Revenue Growth Expert. Your goal is to maximize the Average Order Value (AOV) while protecting profit margins. Always account for real job costs (Product Costs, Travel, etc.) before recommending a final price. If product costs are high, push for higher recommended/premium tiers.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedUpsells: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  serviceName: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  recommendationType: { type: Type.STRING, description: "One of: observed, maintenance_due, preventative" },
                  conditionLevel: { type: Type.STRING, description: "One of: light, moderate, heavy (only if observed)" },
                  originalPrice: { type: Type.NUMBER },
                  bundlePrice: { type: Type.NUMBER },
                  priceRange: { type: Type.STRING },
                  recommendedPrice: { type: Type.NUMBER },
                  requiresProductCost: { type: Type.BOOLEAN },
                  recommendedProduct: { type: Type.STRING },
                  productReason: { type: Type.STRING }
                },
                required: ["serviceName", "reason", "recommendationType", "originalPrice", "bundlePrice", "priceRange", "recommendedPrice", "requiresProductCost"]
              }
            },
            pricingAdjustments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  targetServiceName: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  suggestedRange: { type: Type.STRING },
                  suggestedPrice: { type: Type.NUMBER },
                  impact: { type: Type.STRING }
                },
                required: ["targetServiceName", "reason", "suggestedPrice"]
              }
            },
            bundlingOpportunities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  bundleName: { type: Type.STRING },
                  items: { type: Type.ARRAY, items: { type: Type.STRING } },
                  discountedPrice: { type: Type.NUMBER },
                  savings: { type: Type.NUMBER }
                }
              }
            },
            customerSpecificSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  suggestion: { type: Type.STRING },
                  logic: { type: Type.STRING }
                }
              }
            },
            pricingAnalysis: {
              type: Type.OBJECT,
              properties: {
                laborTarget: { type: Type.NUMBER },
                overhead: { type: Type.NUMBER },
                travelFee: { type: Type.NUMBER },
                totalProductCost: { type: Type.NUMBER },
                floorPrice: { type: Type.NUMBER },
                recommendedPrice: { type: Type.NUMBER },
                premiumPrice: { type: Type.NUMBER },
                estimatedMarginDollars: { type: Type.NUMBER },
                estimatedMarginPercent: { type: Type.NUMBER },
                netAfterProductCost: { type: Type.NUMBER }
              },
              required: ["floorPrice", "recommendedPrice", "premiumPrice", "totalProductCost"]
            }
          },
          required: ["recommendedUpsells", "pricingAnalysis"]
        }
      }
    });

    const result = JSON.parse(response.text);
    if (result.recommendedUpsells) {
       result.recommendedUpsells = result.recommendedUpsells.map((u: any) => {
         const langOpt = generateRecommendationExplanation({
           serviceName: u.serviceName,
           recommendationType: u.recommendationType || 'preventative',
           conditionLevel: u.conditionLevel,
           originalPrice: u.originalPrice || u.recommendedPrice,
           bundlePrice: u.bundlePrice || u.recommendedPrice
         });
         u.reason = langOpt.explanation;
         return u;
       });
    }
    if ((import.meta as any).env?.DEV) {
      console.log(`[AI Protocol] response: ${result.recommendedUpsells?.length ?? 0} upsells, ${result.bundlingOpportunities?.length ?? 0} bundles, pricingAnalysis=${result.pricingAnalysis ? "yes" : "no"}`);
    }
    return result;
  }, 2, 3000, 1, "getRevenueOptimization", [assessment, jobData.totalPrice], _modelId, TIMEOUTS.getRevenueOptimization);
}

/**
 * Smart Quote FAST path — returns ONLY profit-protected pricing tiers
 * (and optional bundling opportunities). Skips the heavy upsell /
 * pricing-adjustment / customer-suggestion sections that Quotes.tsx
 * doesn't render anyway. The smaller response schema is the dominant
 * speed win — Gemini in JSON-schema mode must complete the full output
 * before returning, so cutting ~2/3 of the schema cuts wait time roughly
 * in half. Target latency: 3–6 seconds.
 *
 * Existing `getRevenueOptimization` is unchanged for callers that DO
 * consume the heavy fields (e.g. JobDetail revenue optimization).
 */
/**
 * Optional structured note analysis from src/lib/noteAnalysis.ts.
 * Passed as a hint to the AI so Gemini cannot ignore obvious conditions
 * like water damage, mold, seat removal, multi-year coatings, etc.
 *
 * We accept `any` here to avoid a circular import between lib/ and services/.
 * The shape we use is documented in NoteAnalysis (lib/noteAnalysis.ts).
 */
export interface QuoteNoteAnalysisHint {
  detectedConditions?: string[];
  requiredOperations?: string[];
  estimatedExtraLaborHours?: number;
  localPriceAdjustment?: number;
  manualReviewRecommended?: boolean;
}

export async function getQuotePricingFast(
  assessment: string,
  jobData: {
    services: string[];
    addOns: string[];
    totalPrice: number;
    vehicle: { year?: string; make?: string; model?: string; size?: string };
    customerType: string;
    travelFee?: number;
  },
  productCosts: any[] = [],
  settings: any = {},
  modelTier?: ModelTier,
  noteAnalysis?: QuoteNoteAnalysisHint
): Promise<Pick<RevenueOptimizationResponse, "pricingAnalysis">> {
  const _modelId = resolveModel(modelTier ?? "balanced_intelligence");
  const t0 = (import.meta as any).env?.DEV ? performance.now() : 0;

  return withRetry(async () => {
    const totalProductCost = productCosts.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const travelFee = jobData.travelFee || 0;
    const marginTargets = settings.marginTargets || { floor: 20, recommended: 35, premium: 50 };

    if ((import.meta as any).env?.DEV) {
      console.log(`[SmartQuote AI] payload built in ${(performance.now() - t0).toFixed(0)}ms — sending request`);
    }
    const tSend = (import.meta as any).env?.DEV ? performance.now() : 0;

    // Structured note-analysis hint — tells Gemini exactly which job
    // conditions were detected locally so it cannot underprice by ignoring
    // them. Only included when the analyzer found something.
    const conditions = noteAnalysis?.detectedConditions ?? [];
    const noteHint = conditions.length > 0
      ? `\n\nDETECTED JOB CONDITIONS (from local note analysis — do NOT price as a simple base service):\n${conditions.map(c => `- ${c}`).join("\n")}\nEstimated extra labor: ${noteAnalysis?.estimatedExtraLaborHours ?? 0} hrs.\nLocal benchmark already includes a $${noteAnalysis?.localPriceAdjustment ?? 0} adjustment for these conditions; your tiers MUST be at least this high.${noteAnalysis?.manualReviewRecommended ? "\n⚠ Multiple severe conditions present — recommend pricing toward the premium tier." : ""}`
      : "";

    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [{
        role: "user",
        parts: [{ text: `Profit-protected pricing for a mobile detailing job.

Assessed condition: "${assessment}"
Job specs: ${JSON.stringify(jobData)}
Total product cost: $${totalProductCost}
Travel fee: $${travelFee}
Margin targets: floor ${marginTargets.floor}%, recommended ${marginTargets.recommended}%, premium ${marginTargets.premium}%${noteHint}

Compute three pricing tiers (floor, recommended, premium) for the ENTIRE job using:
  Price = (Labor + Overhead + Travel + Product Cost) / (1 - Target Margin %)
Assume Labor + Overhead is roughly 45% of the current service base price if not specified.
Return ONLY the JSON matching the schema. No prose.` }]
      }],
      config: {
        systemInstruction: `You are a Pricing Engine. Output the JSON object only. No commentary. Account for product cost, travel, and margin targets. Premium = highest quality/protection.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pricingAnalysis: {
              type: Type.OBJECT,
              properties: {
                laborTarget: { type: Type.NUMBER },
                overhead: { type: Type.NUMBER },
                travelFee: { type: Type.NUMBER },
                totalProductCost: { type: Type.NUMBER },
                floorPrice: { type: Type.NUMBER },
                recommendedPrice: { type: Type.NUMBER },
                premiumPrice: { type: Type.NUMBER },
                estimatedMarginDollars: { type: Type.NUMBER },
                estimatedMarginPercent: { type: Type.NUMBER },
                netAfterProductCost: { type: Type.NUMBER }
              },
              required: ["floorPrice", "recommendedPrice", "premiumPrice", "totalProductCost"]
            }
          },
          required: ["pricingAnalysis"]
        }
      }
    });

    if ((import.meta as any).env?.DEV) {
      const tRecv = performance.now();
      console.log(`[SmartQuote AI] response received in ${(tRecv - tSend).toFixed(0)}ms (model=${_modelId})`);
    }

    const result = JSON.parse(response.text);

    if ((import.meta as any).env?.DEV) {
      console.log(`[SmartQuote AI] total roundtrip ${(performance.now() - t0).toFixed(0)}ms`);
    }
    return result;
  }, 2, 3000, 1, "getQuotePricingFast",
     // Cache key: include shape + total + detected conditions so a quote
     // re-priced after notes change (and thus different conditions) does
     // not falsely hit a previous cache entry.
     [
       assessment,
       jobData.services.join(","),
       jobData.addOns.join(","),
       jobData.totalPrice,
       jobData.vehicle?.size || "",
       jobData.customerType,
       (noteAnalysis?.detectedConditions ?? []).join("|"),
     ],
     _modelId, TIMEOUTS.getQuotePricingFast);
}

export interface DeploymentInsight {
  name: string;
  description: string;
  price: number;
  reason: string;
}

export interface DeploymentStrategyResponse {
  insights: DeploymentInsight[];
  summary: string;
}

/**
 * Deployment Intelligence Logic
 * Analyzes operational context for mission-specific billable items
 */
export async function analyzeDeployment(jobData: any, modelTier?: ModelTier): Promise<DeploymentStrategyResponse> {
  const _modelId = resolveModel(modelTier);
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: _modelId,
      contents: [{ 
        role: "user", 
        parts: [{ text: `Analyze this mobile detailing deployment for operational billable items:
        ${JSON.stringify(jobData, null, 2)}
        
        Identify:
        1. Operational surcharges (Travel, Bio, Pet, Large Vehicle, Rush).
        2. Necessary tactical upgrades based on notes or RO/VIN data.
        3. Compliance/Disposal fees if applicable.

        Return JSON with 'insights' (array of {name, description, price, reason}) and 'summary'.` }] 
      }],
      config: {
        systemInstruction: `You are a Tactical Operations AI. Your goal is to ensure every deployment-specific cost is accounted for. If a job requires extra time or supplies due to vehicle size, condition, or location, pinpoint it.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                },
                required: ["name", "description", "price", "reason"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["insights", "summary"]
        }
      }
    });

    return JSON.parse(response.text);
  }, 2, 3000, 1, "analyzeDeployment", [jobData.id], _modelId, TIMEOUTS.analyzeDeployment);
}
