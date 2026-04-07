export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  type: string;
  vin: string;
}

export async function decodeVin(vin: string): Promise<VehicleInfo | null> {
  if (!vin || vin.length < 11) return null;

  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = await response.json();

    if (data.Results && data.Results[0]) {
      const result = data.Results[0];
      return {
        year: result.ModelYear,
        make: result.Make,
        model: result.Model,
        type: result.VehicleType,
        vin: vin,
      };
    }
    return null;
  } catch (error) {
    console.error("VIN Decoding Error:", error);
    return null;
  }
}
