import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

async function withRetry<T>(fn: () => Promise<T>, retries = 10, delay = 7000, attempt = 1): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Handle both string status and numeric code, including nested structures
    const errObj = error.error || error;
    const code = Number(errObj.code || error.status || error.code || 0);
    const message = String(errObj.message || error.message || "").toLowerCase();
    const status = String(errObj.status || "").toUpperCase();
    const name = String(error.name || "").toLowerCase();

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
      throw new Error("QUOTA_EXCEEDED: Your Gemini API spending cap has been reached. Please visit https://ai.studio/spend to manage your project limits.");
    }
    
    if (retries > 0 && isUnavailable) {
      const nextDelay = delay + Math.random() * 7000; // Add more jitter
      console.warn(`Gemini API busy (${code || status || name}), retrying in ${Math.round(nextDelay)}ms... (Attempt ${attempt}, ${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, nextDelay));
      return withRetry(fn, retries - 1, delay * 1.5, attempt + 1);
    }

    // Only log as error on the final failure
    console.error(`Gemini API Final Failure (Attempt ${attempt}):`, JSON.stringify(error));
    throw error;
  }
}

/**
 * Qualifies a lead and generates outreach content
 */
export async function qualifyLeadAI(lead: any): Promise<{
  aiScore: number;
  aiClassification: string;
  aiValueEstimate: number;
  aiRecommendedAction: string;
  aiOutreachDrafts: { sms: string, email: string, callScript: string };
}> {
  return withRetry(async () => {
    const isCollisionCenter = lead.businessType === "collision_center" || 
                             (lead.name && lead.name.toLowerCase().includes("collision")) ||
                             (lead.name && lead.name.toLowerCase().includes("body shop"));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
        systemInstruction: `You are a world-class sales strategist for Flatline Mobile Detail.
        
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
  });
}

/**
 * AI Assistant Integration Logic
 * Extracts structured data from natural language input
 */
export async function askAssistant(input: string, context?: any): Promise<AIResponse> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: `Context: ${JSON.stringify(context)}\n\nUser Request: ${input}` }] }],
      config: {
        systemInstruction: `You are a world-class business consultant, marketing director, and AI assistant for Flatline Mobile Detail.
        
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
  });
}

/**
 * Receipt Analysis Logic
 * Extracts data from receipt images
 */
export async function analyzeReceipt(base64Data: string): Promise<ReceiptData> {
  const mimeType = base64Data.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
  const base64 = base64Data.split(",")[1] || base64Data;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
  });
}

/**
 * AI Upsell Recommendation Logic
 */
export async function getUpsellRecommendations(description: string, jobInfo: any): Promise<UpsellRecommendation[]> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ 
        role: "user", 
        parts: [{ text: `A technician is at a job site and has provided the following assessment: "${description}"

        Job Context:
        Vehicle: ${jobInfo.vehicleInfo}
        Current Services: ${jobInfo.serviceNames?.join(", ")}
        Client Type: ${jobInfo.clientType || "Retail"}
        Address: ${jobInfo.address}

        Based on the technician's description of the vehicle condition, recommend specific upsell services from the following list (or suggest specialized services):
        - Odor Treatment
        - Excessive Pet Hair Removal
        - Mold Remediation
        - Biohazard Cleanup
        - Headliner Cleaning
        - Carpet Extraction/Shampoo
        - Seat Extraction/Shampoo
        - Leather Restoration/Conditioning
        - Paint Correction
        - Ceramic Coating
        - Engine Bay Detail
        - Water Spot Removal
        - Headlight Restoration

        For each recommendation, provide:
        - serviceName: The name of the service
        - reason: Why it's recommended based on the technician's report
        - priceRange: A string describing the typical price range (e.g. "$50 - $120")
        - recommendedPrice: A single numeric price to add to the job if accepted

        Return exactly a JSON array of recommendation objects.` }] 
      }],
      config: {
        systemInstruction: `You are a savvy Upsell Advisor for Flatline Mobile Detail. Your goal is to help technicians maximize revenue by identifying necessary high-value services that match the vehicle's observed condition. Be specific and tactical.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              serviceName: { type: Type.STRING },
              reason: { type: Type.STRING },
              priceRange: { type: Type.STRING },
              recommendedPrice: { type: Type.NUMBER }
            },
            required: ["serviceName", "reason", "priceRange", "recommendedPrice"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  });
}
