import { collection, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export interface VehicleMake {
  Make_ID: number | string;
  Make_Name: string;
  isCustom?: boolean;
}

export interface VehicleModel {
  Make_ID: number | string;
  Make_Name: string;
  Model_ID: number | string;
  Model_Name: string;
  isCustom?: boolean;
}

// Clean, hardcoded list of common vehicle makes to prevent business name contamination
const CLEAN_MAKES = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick", 
  "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ferrari", "Fiat", "Ford", 
  "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", 
  "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lotus", "Maserati", "Mazda", 
  "McLaren", "Mercedes-Benz", "MINI", "Mitsubishi", "Nissan", "Polestar", 
  "Porsche", "Ram", "Rivian", "Rolls-Royce", "Subaru", "Tesla", "Toyota", 
  "Volkswagen", "Volvo"
].sort();

function formatVehicleName(name: string): string {
  if (!name) return "";
  return name.split(' ').map(word => {
    // Keep short acronyms like BMW, GMC, DBX, 911 (numbers)
    if (word.length <= 3 && word.length > 0) return word.toUpperCase();
    // Title case for longer words
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

export async function getMakesForYear(year: string): Promise<VehicleMake[]> {
  const makes: VehicleMake[] = CLEAN_MAKES.map((make, index) => ({
    Make_ID: `clean_${index}`,
    Make_Name: make // Keep original title case from CLEAN_MAKES
  }));

  // Fetch custom makes added by users
  try {
    const customMakesSnap = await getDocs(collection(db, "custom_vehicle_makes"));
    const customMakes = customMakesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        Make_ID: doc.id,
        Make_Name: formatVehicleName(data.make),
        isCustom: true
      };
    });

    // Merge and deduplicate
    const allMakes = [...makes];
    for (const cm of customMakes) {
      if (!allMakes.some(m => m.Make_Name.toUpperCase() === cm.Make_Name.toUpperCase())) {
        allMakes.push(cm);
      }
    }
    return allMakes.sort((a, b) => a.Make_Name.localeCompare(b.Make_Name));
  } catch (error) {
    console.error("Error fetching custom makes:", error);
    return makes;
  }
}

export async function getModelsForMakeYear(make: string, year: string): Promise<VehicleModel[]> {
  let models: VehicleModel[] = [];
  
  // Only fetch from NHTSA if it's not a custom make (or even if it is, NHTSA might return empty, which is fine)
  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformakeyear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`);
    if (response.ok) {
      const data = await response.json();
      if (data.Results) {
        models = data.Results.map((m: any) => ({
          Make_ID: m.Make_ID,
          Make_Name: m.Make_Name,
          Model_ID: m.Model_ID,
          Model_Name: formatVehicleName(m.Model_Name)
        }));
      }
    }
  } catch (error) {
    console.error("Error fetching models from NHTSA:", error);
  }

  // Filter out any obvious noise from NHTSA models
  models = models.filter(m => {
    const name = m.Model_Name;
    if (name.includes(" LLC") || name.includes(" INC") || name.includes(" CORP") || name.includes(" COMPANY")) return false;
    return true;
  });

  // Fetch custom models for this make
  try {
    const q = query(collection(db, "custom_vehicle_models"), where("make", "==", make.toUpperCase()));
    const customModelsSnap = await getDocs(q);
    const customModels = customModelsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        Make_ID: "custom",
        Make_Name: formatVehicleName(data.make),
        Model_ID: doc.id,
        Model_Name: formatVehicleName(data.model),
        isCustom: true
      };
    });

    // Merge and deduplicate
    for (const cm of customModels) {
      if (!models.some(m => m.Model_Name.toUpperCase() === cm.Model_Name.toUpperCase())) {
        models.push(cm);
      }
    }
  } catch (error) {
    console.error("Error fetching custom models:", error);
  }

  return models.sort((a, b) => a.Model_Name.localeCompare(b.Model_Name));
}

export async function saveCustomVehicle(make: string, model: string) {
  const makeFormatted = formatVehicleName(make.trim());
  const modelFormatted = formatVehicleName(model.trim());
  
  const makeUpper = makeFormatted.toUpperCase();
  const modelUpper = modelFormatted.toUpperCase();

  if (!makeUpper) return;

  // Validation to prevent business names from contaminating the custom vehicle dataset
  const businessSuffixes = [
    " LLC", " INC", " CORP", " LTD", " CO.", " COMPANY", " CORPORATION",
    " MOTOR CO", " MOTOR SALES", " NORTH AMERICA", " GROUP", " HOLDINGS", " INDUSTRIES",
    " TRAILER", " TRUCK", " EQUIPMENT", " MANUFACTURING", " MFG", " FABRICATION", " ENGINEERING"
  ];

  const isBusinessName = (name: string) => {
    if (!name) return false;
    return businessSuffixes.some(suffix => name.includes(suffix)) || name.length > 35;
  };

  if (isBusinessName(makeUpper) || isBusinessName(modelUpper)) {
    console.warn("Attempted to save a business name as a custom vehicle. Blocked.");
    return;
  }

  try {
    // Check if make exists
    const makeQ = query(collection(db, "custom_vehicle_makes"), where("make", "==", makeUpper));
    const makeSnap = await getDocs(makeQ);
    if (makeSnap.empty && !CLEAN_MAKES.map(m => m.toUpperCase()).includes(makeUpper)) {
      await addDoc(collection(db, "custom_vehicle_makes"), {
        make: makeFormatted,
        createdAt: serverTimestamp()
      });
    }

    // Check if model exists
    if (modelUpper) {
      const modelQ = query(
        collection(db, "custom_vehicle_models"), 
        where("make", "==", makeUpper),
        where("model", "==", modelUpper)
      );
      const modelSnap = await getDocs(modelQ);
      if (modelSnap.empty) {
        await addDoc(collection(db, "custom_vehicle_models"), {
          make: makeFormatted,
          model: modelFormatted,
          createdAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error("Error saving custom vehicle:", error);
  }
}

