export type RecommendationType = "observed" | "maintenance_due" | "preventative";
export type ConditionLevel = "light" | "moderate" | "heavy";

export interface RecommendationInput {
  serviceName: string;
  vehicleId?: string;
  recommendationType: RecommendationType;
  conditionLevel?: ConditionLevel;
  originalPrice: number;
  bundlePrice: number;
}

export interface RecommendationOutput {
  serviceName: string;
  originalPrice: number;
  bundlePrice: number;
  savings: number;
  explanation: string;
}

const variations = {
  observed: {
    light: [
      "There are early signs of wear. Addressing this now helps maintain the material and prevent further deterioration.",
      "Minor wear was noticed. Taking care of it at this stage helps preserve the surface and avoid future issues.",
      "We see slight signs of use. Applying this service now protects the finish and prevents worsening."
    ],
    moderate: [
      "The surface is showing noticeable wear. Treating it at this stage helps restore appearance and protect it from further damage.",
      "Clear signs of wear are present. This service will restore the material's look and provide essential protection.",
      "We noticed moderate wear on the surface. Addressing it during this visit improves the condition and prevents progression."
    ],
    heavy: [
      "The material is showing significant wear. This service will help improve condition and prevent further breakdown.",
      "Considerable wear is visible. Treating this is important to restore functionality and halt further degradation.",
      "There is substantial wear present. This service mitigates the damage and improves the overall condition."
    ]
  },
  maintenance_due: [
    "This service is recommended periodically to maintain the condition of the material and preserve the overall appearance.",
    "Routine application of this service ensures long-term durability and keeps the asset looking its best.",
    "Regular maintenance with this service preserves quality and supports easier upkeep over time."
  ],
  preventative: [
    "This service helps protect the surface from future wear and makes ongoing maintenance easier.",
    "Applying this preventative measure adds a durable layer of protection against the elements.",
    "This approach defends the material from premature wear, ensuring long-lasting defense."
  ]
};

// Simple pseudo-random selector based on serviceName length so it feels varied but deterministic
const getVariation = (arr: string[], seed: string) => {
  const index = seed.length % arr.length;
  return arr[index];
};

export function generateRecommendationExplanation(input: RecommendationInput): RecommendationOutput {
  const savings = Math.max(0, input.originalPrice - input.bundlePrice);
  
  let explanation = "";

  if (input.recommendationType === "observed") {
    if (input.conditionLevel === "heavy") {
      explanation = getVariation(variations.observed.heavy, input.serviceName);
    } else if (input.conditionLevel === "moderate") {
      explanation = getVariation(variations.observed.moderate, input.serviceName);
    } else {
      explanation = getVariation(variations.observed.light, input.serviceName);
    }
  } else if (input.recommendationType === "maintenance_due") {
    explanation = getVariation(variations.maintenance_due, input.serviceName);
  } else if (input.recommendationType === "preventative") {
    explanation = getVariation(variations.preventative, input.serviceName);
  } else {
    explanation = `We recommend ${input.serviceName} to enhance the quality and longevity of your vehicle.`;
  }

  return {
    serviceName: input.serviceName,
    originalPrice: input.originalPrice,
    bundlePrice: input.bundlePrice,
    savings,
    explanation
  };
}
