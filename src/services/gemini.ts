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
      systemInstruction: `You are a specialized AI assistant for Flatline Mobile Detail. 
      Extract structured data from the user's request. 
      Identify the intent (schedule, quote, search, report, or other).
      Extract entities like customer name, vehicle info, VIN, RO number, service type, date, time, and amount.
      Provide a helpful suggestion based on the extracted data.`,
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
