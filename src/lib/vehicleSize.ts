import { VehicleSize } from "../types";

export interface VehicleSizeDetectionInput {
  make?: string | null;
  model?: string | null;
  type?: string | null;
  bodyStyle?: string | null;
  vehicleInfo?: string | null;
}

const EXTRA_LARGE_PATTERNS = [
  "large suv",
  "cargo van",
  "super duty",
  "suburban",
  "tahoe",
  "yukon",
  "expedition",
  "escalade",
  "navigator",
  "sprinter",
  "transit",
  "promaster",
  "dually",
  "2500",
  "3500",
];

const LARGE_PATTERNS = [
  "pickup",
  "minivan",
  "truck",
  "explorer",
  "highlander",
  "pilot",
  "pathfinder",
  "traverse",
  "4runner",
  "tacoma",
  "f-150",
  "f150",
  "silverado",
  "ram",
  "sierra",
  "tundra",
  "van",
];

const MEDIUM_PATTERNS = [
  "small suv",
  "crossover",
  "rav4",
  "rav 4",
  "cr-v",
  "crv",
  "rogue",
  "equinox",
  "escape",
  "forester",
  "tucson",
  "sportage",
  "cherokee",
];

const SMALL_PATTERNS = [
  "coupe",
  "compact",
  "sedan",
  "hatchback",
  "civic",
  "corolla",
  "elantra",
  "accord",
  "camry",
  "altima",
  "malibu",
  "sentra",
  "forte",
  "versa",
  "jetta",
];

const hasPattern = (source: string, patterns: string[]) =>
  patterns.some((pattern) => source.includes(pattern));

export function isVehicleSize(value: FormDataEntryValue | string | null | undefined): value is VehicleSize {
  return value === "small" || value === "medium" || value === "large" || value === "extra_large";
}

export function detectVehicleSize(input: VehicleSizeDetectionInput): VehicleSize | null {
  const source = [
    input.make,
    input.model,
    input.type,
    input.bodyStyle,
    input.vehicleInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!source.trim()) return null;

  if (hasPattern(source, EXTRA_LARGE_PATTERNS)) return "extra_large";
  if (hasPattern(source, LARGE_PATTERNS)) return "large";
  if (hasPattern(source, MEDIUM_PATTERNS)) return "medium";
  if (hasPattern(source, SMALL_PATTERNS)) return "small";

  return null;
}
