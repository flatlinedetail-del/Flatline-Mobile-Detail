import { VehicleSize } from "../types";

export interface VehicleImageInput {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  type?: string | null;
  size?: VehicleSize | string | null;
  bodyStyle?: string | null;
  vehicleInfo?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  vehicleImage?: string | null;
  thumbnailUrl?: string | null;
}

type VehicleImageCategory =
  | "luxury"
  | "truck"
  | "large_suv"
  | "van"
  | "suv"
  | "hatchback"
  | "sedan";

const FALLBACK_IMAGES: Record<VehicleImageCategory, string> = {
  luxury: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1200",
  truck: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&q=80&w=1200",
  large_suv: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&q=80&w=1200",
  van: "https://images.unsplash.com/photo-1520050206274-a1cb4463300a?auto=format&fit=crop&q=80&w=1200",
  suv: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=1200",
  hatchback: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&q=80&w=1200",
  sedan: "https://images.unsplash.com/photo-1549317661-bd32c8ce0be2?auto=format&fit=crop&q=80&w=1200",
};

const LUXURY_KEYWORDS = [
  "aston martin",
  "ferrari",
  "lamborghini",
  "bentley",
  "rolls royce",
  "rolls-royce",
  "porsche",
  "mclaren",
  "maserati",
  "maybach",
  "lotus",
  "bugatti",
  "luxury",
  "exotic",
];

const TRUCK_KEYWORDS = [
  "f-150",
  "f150",
  "chevy silverado",
  "chevrolet silverado",
  "gmc sierra",
  "ford f-150",
  "ford f150",
  "silverado",
  "silverado hd",
  "silverado 1500",
  "silverado 2500",
  "silverado 3500",
  "hd",
  "heavy duty",
  "1500",
  "2500",
  "3500",
  "dually",
  "ram",
  "sierra",
  "tundra",
  "tacoma",
  "ranger",
  "colorado",
  "titan",
  "truck",
  "pickup",
];

const LARGE_SUV_KEYWORDS = [
  "tahoe",
  "suburban",
  "yukon",
  "expedition",
  "escalade",
  "navigator",
  "sequoia",
  "armada",
  "large suv",
];

const VAN_KEYWORDS = [
  "sprinter",
  "transit",
  "promaster",
  "cargo van",
  "minivan",
  "van",
];

const SUV_KEYWORDS = ["suv", "crossover", "rav4", "cr-v", "crv", "rogue", "equinox", "escape", "forester", "tucson", "sportage", "cherokee"];
const HATCHBACK_KEYWORDS = ["hatchback", "compact"];

const hasKeyword = (source: string, keywords: string[]) =>
  keywords.some((keyword) => source.includes(keyword));

const buildVehicleImageSource = (vehicle: VehicleImageInput) =>
  [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.type,
    vehicle.size,
    vehicle.bodyStyle,
    vehicle.vehicleInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export function getStoredVehicleImageUrl(vehicle: VehicleImageInput): string | null {
  return vehicle.imageUrl || vehicle.photoUrl || vehicle.vehicleImage || vehicle.thumbnailUrl || null;
}

export function getVehicleImageCategory(vehicle: VehicleImageInput): VehicleImageCategory {
  const source = buildVehicleImageSource(vehicle);

  if (hasKeyword(source, VAN_KEYWORDS) || vehicle.size === "extra_large" || vehicle.size === "van") return "van";
  if (hasKeyword(source, TRUCK_KEYWORDS) || vehicle.size === "truck") return "truck";
  if (hasKeyword(source, LUXURY_KEYWORDS)) return "luxury";
  if (hasKeyword(source, LARGE_SUV_KEYWORDS) || vehicle.size === "suv_large") return "large_suv";
  if (hasKeyword(source, SUV_KEYWORDS) || vehicle.size === "medium" || vehicle.size === "suv_small") return "suv";
  if (hasKeyword(source, HATCHBACK_KEYWORDS)) return "hatchback";

  return "sedan";
}

export function getVehicleFallbackImageUrl(vehicle: VehicleImageInput): string {
  return FALLBACK_IMAGES[getVehicleImageCategory(vehicle)];
}

export function getVehicleImageUrl(vehicle: VehicleImageInput): string {
  return getStoredVehicleImageUrl(vehicle) || getVehicleFallbackImageUrl(vehicle);
}
