export interface VehicleMake {
  Make_ID: number;
  Make_Name: string;
}

export interface VehicleModel {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

export async function getMakes(): Promise<VehicleMake[]> {
  try {
    const response = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json');
    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("NHTSA API returned non-JSON response:", text.substring(0, 100));
      throw new Error("NHTSA API returned non-JSON response");
    }
    const data = await response.json();
    return data.Results || [];
  } catch (error) {
    console.error("Error fetching makes:", error);
    return [];
  }
}

export async function getMakesForYear(year: string): Promise<VehicleMake[]> {
  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForModelYear/modelyear/${year}?format=json`);
    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("NHTSA API returned non-JSON response:", text.substring(0, 100));
      throw new Error("NHTSA API returned non-JSON response");
    }
    const data = await response.json();
    return data.Results || [];
  } catch (error) {
    console.error("Error fetching makes for year:", error);
    return [];
  }
}

export async function getModelsForMakeYear(make: string, year: string): Promise<VehicleModel[]> {
  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformakeyear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`);
    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("NHTSA API returned non-JSON response:", text.substring(0, 100));
      throw new Error("NHTSA API returned non-JSON response");
    }
    const data = await response.json();
    return data.Results || [];
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
}
