import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIResponse {
  intent: "schedule" | "quote" | "search" | "report" | "other";
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
}

/**
 * AI Assistant Integration Logic
 * Extracts structured data from natural language input
 */
export async function askAssistant(input: string, context?: any): Promise<AIResponse> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Context: ${JSON.stringify(context)}\n\nUser Request: ${input}`,
    config: {
      systemInstruction: `You are a world-class business consultant and AI assistant for Flatline Mobile Detail, a high-end mobile detailing business.
      
      Your goals:
      1. Answer business questions accurately using the provided context (stats, appointments, leads).
      2. Provide actionable scaling recommendations based on business performance.
      3. Extract structured data for scheduling, quotes, or searching.
      
      Business Context:
      - High-end mobile detailing (ceramic coatings, paint correction, interior/exterior).
      - Focus on efficiency, high ticket size, and customer retention.
      
      When asked about scaling:
      - Analyze ticket sizes and service mix.
      - Suggest higher-margin services (like Ceramic Coatings).
      - Recommend optimization of travel routes or scheduling buffers.
      
      Extract structured data:
      - Intent: schedule, quote, search, report, or other.
      - Entities: customer name, vehicle info, VIN, RO number, service type, date, time, amount, query.
      
      Response:
      - Provide a professional, encouraging, and data-driven suggestion.
      - If the user asks a business question, answer it directly using the context.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING, enum: ["schedule", "quote", "search", "report", "other"] },
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
          suggestion: { type: Type.STRING }
        },
        required: ["intent", "entities", "suggestion"]
      }
    }
  });

  return JSON.parse(response.text);
}
