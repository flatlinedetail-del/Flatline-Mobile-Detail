import { collection, addDoc, serverTimestamp, Timestamp, getDocs, query, where, doc, setDoc, deleteDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { addDays, subDays, subMonths, setHours, setMinutes } from "date-fns";
import { ensureClientTypes } from "./clientService";

export async function seedServiceTimingDemo() {
  try {
    const toastId = "seeding-timing-intel";
    console.log("Seeding Service Timing Demo Data...");

    // 0. Ensure Client Types exist (required by security rules)
    const clientTypes = await ensureClientTypes();
    const retailType = clientTypes.find(t => t.slug === "retail");
    const retailTypeId = retailType?.id || "retail_default";

    // 1. Seed Demo Services
    const demoServicesData = [
      { name: "Maintenance Wash (Demo)", category: "Wash", maintenanceIntervalDays: 14, basePrice: 50, pricingBySize: { small: 40, medium: 50, large: 60, extra_large: 70 }, isActive: true, description: "Regular maintenance wash every 2 weeks" },
      { name: "Clay & Seal (Demo)", category: "Detail", maintenanceIntervalMonths: 6, basePrice: 250, pricingBySize: { small: 200, medium: 250, large: 300, extra_large: 350 }, isActive: true, description: "Decontamination and sealant every 6 months" },
      { name: "Interior Protection (Demo)", category: "Interior", maintenanceIntervalMonths: 3, basePrice: 150, pricingBySize: { small: 120, medium: 150, large: 180, extra_large: 200 }, isActive: true, description: "Leather and fabric protection every 3 months" },
      { name: "Ceramic Coating (Demo)", category: "Protection", maintenanceIntervalMonths: 12, basePrice: 800, pricingBySize: { small: 700, medium: 800, large: 900, extra_large: 1000 }, isActive: true, description: "Advanced paint protection every 12 months" },
    ];

    const serviceIds: Record<string, string> = {};
    for (const s of demoServicesData) {
      // Check if already exists to prevent duplicates
      const q = query(collection(db, "services"), where("name", "==", s.name));
      const snap = await getDocs(q);
      if (snap.empty) {
        const docRef = await addDoc(collection(db, "services"), s);
        serviceIds[s.name] = docRef.id;
      } else {
        serviceIds[s.name] = snap.docs[0].id;
      }
    }

    // 2. Seed Client
    const clientData = {
      firstName: "Timothy",
      lastName: "Timing (Demo)",
      name: "Timothy Timing (Demo)",
      email: "timothy@demo.com",
      phone: "(555) 000-9999",
      address: "555 Intel Ave, Austin, TX 78701",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      clientTypeId: retailTypeId,
      loyaltyPoints: 100,
      membershipLevel: "gold",
      isVIP: true,
      categoryIds: ["demo"],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    let clientId = "";
    const clientQ = query(collection(db, "clients"), where("email", "==", clientData.email));
    const clientSnap = await getDocs(clientQ);
    if (clientSnap.empty) {
      const clientRef = await addDoc(collection(db, "clients"), clientData);
      clientId = clientRef.id;
    } else {
      clientId = clientSnap.docs[0].id;
    }

    // 3. Seed Vehicles
    const vehiclesData = [
      { clientId, ownerId: clientId, ownerType: "client", year: "2024", make: "Porsche", model: "911 Carrera", color: "Guards Red", size: "small", vin: "DEMO-PORSCHE-1", createdAt: serverTimestamp() },
      { clientId, ownerId: clientId, ownerType: "client", year: "2023", make: "Rivian", model: "R1S", color: "Launch Green", size: "extra_large", vin: "DEMO-RIVIAN-1", createdAt: serverTimestamp() },
    ];

    const vehicleIds: Record<string, string> = {};
    for (const v of vehiclesData) {
      const vQ = query(collection(db, "vehicles"), where("vin", "==", v.vin));
      const vSnap = await getDocs(vQ);
      if (vSnap.empty) {
        const vRef = await addDoc(collection(db, "vehicles"), v);
        vehicleIds[v.make] = vRef.id;
      } else {
        vehicleIds[v.make] = vSnap.docs[0].id;
      }
    }

    // 4. Seed History (Appointments)
    const now = new Date();
    const history = [
      // Porsche (Asset A): Maintenance Wash (14 days) -> OVERDUE (Last done 15 days ago)
      {
        clientId,
        customerName: "Timothy Timing (Demo)",
        vehicleId: vehicleIds["Porsche"],
        vehicleIds: [vehicleIds["Porsche"]],
        vehicleInfo: "2024 Porsche 911 Carrera",
        status: "completed",
        scheduledAt: Timestamp.fromDate(subDays(now, 15)),
        serviceIds: [serviceIds["Maintenance Wash (Demo)"]],
        serviceNames: ["Maintenance Wash (Demo)"],
        totalAmount: 50,
        createdAt: serverTimestamp(),
      },
      // Porsche (Asset A): Clay & Seal (6 months) -> DUE SOON (Last done 5 months and 25 days ago)
      {
        clientId,
        customerName: "Timothy Timing (Demo)",
        vehicleId: vehicleIds["Porsche"],
        vehicleIds: [vehicleIds["Porsche"]],
        vehicleInfo: "2024 Porsche 911 Carrera",
        status: "completed",
        scheduledAt: Timestamp.fromDate(subDays(subMonths(now, 6), -5)), // 6 months minus 5 days ago
        serviceIds: [serviceIds["Clay & Seal (Demo)"]],
        serviceNames: ["Clay & Seal (Demo)"],
        totalAmount: 250,
        createdAt: serverTimestamp(),
      },
      // Rivian (Asset B): Interior Protection (3 months) -> DUE (Last done exactly 3 months ago)
      {
        clientId,
        customerName: "Timothy Timing (Demo)",
        vehicleId: vehicleIds["Rivian"],
        vehicleIds: [vehicleIds["Rivian"]],
        vehicleInfo: "2023 Rivian R1S",
        status: "completed",
        scheduledAt: Timestamp.fromDate(subMonths(now, 3)),
        serviceIds: [serviceIds["Interior Protection (Demo)"]],
        serviceNames: ["Interior Protection (Demo)"],
        totalAmount: 150,
        createdAt: serverTimestamp(),
      },
      // Rivian (Asset B): Maintenance Wash (14 days) -> CURRENT (Last done 2 days ago)
      {
        clientId,
        customerName: "Timothy Timing (Demo)",
        vehicleId: vehicleIds["Rivian"],
        vehicleIds: [vehicleIds["Rivian"]],
        vehicleInfo: "2023 Rivian R1S",
        status: "completed",
        scheduledAt: Timestamp.fromDate(subDays(now, 2)),
        serviceIds: [serviceIds["Maintenance Wash (Demo)"]],
        serviceNames: ["Maintenance Wash (Demo)"],
        totalAmount: 50,
        createdAt: serverTimestamp(),
      },
      // Rivian (Asset B): Ceramic Coating (12 months) -> OVERDUE (Last done 13 months ago)
      {
        clientId,
        customerName: "Timothy Timing (Demo)",
        vehicleId: vehicleIds["Rivian"],
        vehicleIds: [vehicleIds["Rivian"]],
        vehicleInfo: "2023 Rivian R1S",
        status: "completed",
        scheduledAt: Timestamp.fromDate(subMonths(now, 13)),
        serviceIds: [serviceIds["Ceramic Coating (Demo)"]],
        serviceNames: ["Ceramic Coating (Demo)"],
        totalAmount: 800,
        createdAt: serverTimestamp(),
      },
    ];

    for (const h of history) {
      // Simplification: we'll just add the history for the demo without checking for duplicates 
      // to avoid composite index requirements that might stall the seeding process on fresh databases.
      await addDoc(collection(db, "appointments"), h);
    }

    console.log("Service Timing Demo Data Seeded Successfully.");
    return true;
  } catch (error) {
    console.error("Error seeding service timing data:", error);
    return false;
  }
}

export async function seedDemoData() {
  try {
    // Lead Seeding...
    const leads = [
      { name: "Michael Jordan", phone: "(555) 232-3232", email: "mj@bulls.com", status: "new", priority: "hot", vehicleInfo: "2023 Ferrari SF90", createdAt: serverTimestamp() },
      { name: "Serena Williams", phone: "(555) 123-4567", email: "serena@tennis.com", status: "follow_up", priority: "warm", vehicleInfo: "2024 Range Rover Autobiography", createdAt: serverTimestamp() },
      { name: "Tiger Woods", phone: "(555) 987-6543", email: "tiger@golf.com", status: "quoted", priority: "hot", vehicleInfo: "2022 Genesis GV80", createdAt: serverTimestamp() },
    ];

    for (const lead of leads) {
      await addDoc(collection(db, "leads"), lead);
    }

    // Customer Seeding (Legacy)
    const customers = [
      { name: "Elon Musk", phone: "(555) 420-6969", email: "elon@x.com", address: "1 Tesla Way, Austin, TX", loyaltyPoints: 1250, createdAt: serverTimestamp() },
      { name: "Jeff Bezos", phone: "(555) 111-2222", email: "jeff@amazon.com", address: "1000 Blue Origin Blvd, Van Horn, TX", loyaltyPoints: 500, createdAt: serverTimestamp() },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const docRef = await addDoc(collection(db, "customers"), customer);
      customerIds.push(docRef.id);
    }

    // Vendor Seeding
    const vendors = [
      { businessName: "North Austin Collision", contactName: "Dave Miller", phone: "(555) 999-8888", email: "billing@northaustin.com", type: "collision_center", billingTerms: "net_30", createdAt: serverTimestamp() },
      { businessName: "South Austin BMW", contactName: "Sarah Connor", phone: "(555) 777-6666", email: "service@southaustinbmw.com", type: "dealership", billingTerms: "net_15", createdAt: serverTimestamp() },
    ];

    const vendorIds = [];
    for (const vendor of vendors) {
      const docRef = await addDoc(collection(db, "vendors"), vendor);
      vendorIds.push(docRef.id);
    }

    // Appointment Seeding
    const now = new Date();
    const appointments = [
      { 
        customerId: customerIds[0], 
        customerName: "Elon Musk",
        vehicleInfo: "2024 Tesla Cybertruck", 
        status: "scheduled", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(now, 0), 10)), 
        address: "1 Tesla Way, Austin, TX",
        totalAmount: 450,
        serviceNames: ["Full Interior", "Exterior Wash", "Ceramic Boost"]
      },
      { 
        customerId: customerIds[1], 
        customerName: "Jeff Bezos",
        vehicleInfo: "2023 Rivian R1S", 
        status: "in_progress", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(now, 30), 13)), 
        address: "1000 Blue Origin Blvd, Van Horn, TX",
        totalAmount: 350,
        serviceNames: ["Interior Detail", "Ozone Treatment"]
      },
      { 
        vendorId: vendorIds[0], 
        customerName: "North Austin Collision",
        vehicleInfo: "2024 Porsche 911 GT3", 
        status: "completed", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(subDays(now, 1), 0), 9)), 
        address: "123 Collision Way, Austin, TX",
        totalAmount: 1200,
        vin: "WP0AA2A9XRS200001",
        roNumber: "RO-99821",
        serviceNames: ["Overspray Removal", "Paint Correction", "Ceramic Coating"]
      },
    ];

    for (const app of appointments) {
      await addDoc(collection(db, "appointments"), app);
    }

    // Run Service Timing Demo Seeding
    await seedServiceTimingDemo();

    return true;
  } catch (error) {
    console.error("Error seeding data:", error);
    return false;
  }
}

export async function importFullServiceSystem() {
  try {
    console.log("Starting Official Full Service System Import...");

    // 1. Clear existing services, addons, and categories
    const collectionsToClear = ["services", "addons", "categories"];
    for (const colName of collectionsToClear) {
      const snap = await getDocs(collection(db, colName));
      for (const docRef of snap.docs) {
        await deleteDoc(doc(db, colName, docRef.id));
      }
    }
    console.log("Old services, addons, and categories purged.");

    // 2. Define Categories
    const categoriesRoot = [
      { id: "maintenance", name: "Maintenance", type: "service", isActive: true, sortOrder: 0 },
      { id: "protection", name: "Protection", type: "service", isActive: true, sortOrder: 1 },
      { id: "paint-correction", name: "Paint Correction", type: "service", isActive: true, sortOrder: 2 },
      { id: "add-ons", name: "Add-Ons", type: "addon", isActive: true, sortOrder: 3 },
    ];

    for (const cat of categoriesRoot) {
      await setDoc(doc(db, "categories", cat.id), cat);
    }

    // 3. Define Services
    const servicesData = [
      {
        id: "xpress-maintenance-detail",
        name: "Xpress Maintenance Detail",
        category: "Maintenance",
        categoryId: "maintenance",
        description: "Entry-level maintenance service designed for returning clients or regularly maintained vehicles. Includes foam wash, wheels, wells, windows, air blowout, light vacuum, and light wipe down.",
        basePrice: 80,
        pricingBySize: {
          small: 80,
          medium: 120,
          large: 150,
          extra_large: 180
        },
        isActive: true,
        estimatedDuration: 90,
        bufferTimeMinutes: 15,
        isTaxable: true,
        requiresWaiver: false
      },
      {
        id: "clay-seal-protection-detail",
        name: "Clay & Seal Protection Detail",
        category: "Protection",
        categoryId: "protection",
        description: "Premium protection detail and most popular service. Includes clay bar decontamination, 6-month sealant protection, and gloss enhancement.",
        basePrice: 180,
        pricingBySize: {
          small: 180,
          medium: 250,
          large: 320,
          extra_large: 400
        },
        isActive: true,
        estimatedDuration: 180,
        bufferTimeMinutes: 30,
        isTaxable: true,
        requiresWaiver: false
      },
      {
        id: "paint-enhancement-polish",
        name: "Paint Enhancement & Polish",
        category: "Paint Correction",
        categoryId: "paint-correction",
        description: "Single-stage machine polish designed to restore gloss and clarity while removing light surface defects.",
        basePrice: 350,
        pricingBySize: {
          small: 350,
          medium: 500,
          large: 650,
          extra_large: 800
        },
        isActive: true,
        estimatedDuration: 300,
        bufferTimeMinutes: 30,
        isTaxable: true,
        requiresWaiver: true
      },
      {
        id: "one-step-paint-correction",
        name: "One-Step Paint Correction",
        category: "Paint Correction",
        categoryId: "paint-correction",
        description: "Professional machine correction aimed at removing 60-80% of swirl marks and scratches. Significantly improves paint depth and clarity.",
        basePrice: 600,
        pricingBySize: {
          small: 600,
          medium: 850,
          large: 1100,
          extra_large: 1400
        },
        isActive: true,
        estimatedDuration: 480,
        bufferTimeMinutes: 60,
        isTaxable: true,
        requiresWaiver: true
      }
    ];

    for (const service of servicesData) {
      await setDoc(doc(db, "services", service.id), service);
    }

    // 4. Define Add-Ons
    const addonsData = [
      { id: "pet-hair-removal", name: "Pet Hair Removal", price: 50, description: "Professional removal of embedded pet hair.", isActive: true, estimatedDuration: 30, bufferTimeMinutes: 0, isTaxable: true },
      { id: "engine-bay-detail", name: "Engine Bay Detail", price: 60, description: "Deep cleaning and dressing of engine bay.", isActive: true, estimatedDuration: 30, bufferTimeMinutes: 0, isTaxable: true },
      { id: "headlight-restoration", name: "Headlight Restoration", price: 85, description: "Restores clarity to oxidized headlights.", isActive: true, estimatedDuration: 60, bufferTimeMinutes: 0, isTaxable: true },
      { id: "ozone-treatment", name: "Ozone Odor Treatment", price: 100, description: "Eliminates biological and organic odors.", isActive: true, estimatedDuration: 30, bufferTimeMinutes: 0, isTaxable: true }
    ];

    for (const addon of addonsData) {
      await setDoc(doc(db, "addons", addon.id), addon);
    }

    console.log("Official Service Catalog Imported.");
    return true;
  } catch (error) {
    console.error("Error importing service system:", error);
    return false;
  }
}

/**
 * Non-destructive installer for the DetailFlow approved service menu.
 * - Creates or updates the 6 approved packages (never hard-deletes).
 * - Marks services whose name contains "(Demo)" as inactive.
 * - Ensures required service categories exist.
 * - Safe to run repeatedly; skips docs that already match.
 */
export async function installDetailFlowServices(): Promise<{ created: number; updated: number; deactivated: number }> {
  type RebookingBehavior = "none" | "suggest_next" | "require_next_prompt" | "recurring_recommended";

  const packages: Array<{
    name: string;
    description: string;
    category: string;
    basePrice: number;
    pricingBySize: Record<string, number>;
    estimatedDuration: number;
    bufferTimeMinutes: number;
    isTaxable: boolean;
    requiresWaiver: boolean;
    isActive: boolean;
    recommendedFrequencyDays: number;
    recurringEligible: boolean;
    rebookingBehavior: RebookingBehavior;
    priceFloor: number;
    packageEligible: boolean;
    aiRecommendable: boolean;
    upgradeToNames: string[];
  }> = [
    {
      name: "Xpress Detail",
      description: "A fast maintenance detail designed to refresh your vehicle inside and out. Best for vehicles in fair to good condition needing a clean, polished look without a deep reset. Includes exterior hand wash, wheels/tires/wheel wells, tire shine, exterior windows, light interior vacuum, interior wipe-down, door jamb wipe-down, and interior windows.",
      category: "Maintenance",
      basePrice: 110,
      pricingBySize: { small: 90, medium: 110, large: 130, extra_large: 150 },
      estimatedDuration: 90,
      bufferTimeMinutes: 15,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 30,
      recurringEligible: true,
      rebookingBehavior: "suggest_next",
      priceFloor: 90,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: ["Full Detail", "Premium Detail"],
    },
    {
      name: "Maintenance Detail",
      description: "A recurring-client maintenance service designed to keep a previously detailed vehicle clean, protected, and easy to maintain. Ideal for clients on a regular schedule. Includes exterior hand wash, wheels/tires, tire dressing, interior vacuum, interior wipe-down, glass cleaning, light dust removal, and quick condition check. Available for approved maintenance clients or vehicles recently serviced by us.",
      category: "Maintenance",
      basePrice: 100,
      pricingBySize: { small: 85, medium: 100, large: 120, extra_large: 140 },
      estimatedDuration: 75,
      bufferTimeMinutes: 15,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 30,
      recurringEligible: true,
      rebookingBehavior: "recurring_recommended",
      priceFloor: 85,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: ["Xpress Detail", "Full Detail"],
    },
    {
      name: "Interior Reset",
      description: "A deeper interior cleaning service designed to restore the inside of your vehicle to a fresher, cleaner condition. Targets built-up dirt, dust, grime, and daily-use wear. Includes thorough vacuum, seats/carpets/mats/cargo area, interior panels/dashboard/console/cupholders, door panels and jambs, interior glass, light stain treatment, and steam or deep cleaning where appropriate.",
      category: "Interior",
      basePrice: 200,
      pricingBySize: { small: 175, medium: 200, large: 235, extra_large: 275 },
      estimatedDuration: 180,
      bufferTimeMinutes: 20,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 90,
      recurringEligible: false,
      rebookingBehavior: "suggest_next",
      priceFloor: 175,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: ["Full Detail", "Premium Detail"],
    },
    {
      name: "Clay & Seal Exterior",
      description: "An exterior protection service designed to remove bonded surface contamination and leave paint smooth, glossy, and protected. Ideal when paint feels rough or no longer beads water. Includes exterior hand wash, wheels/tires, paint decontamination, clay treatment, bug and road grime removal, exterior glass, paint sealant, and tire dressing.",
      category: "Exterior Protection",
      basePrice: 200,
      pricingBySize: { small: 175, medium: 200, large: 235, extra_large: 265 },
      estimatedDuration: 180,
      bufferTimeMinutes: 20,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 120,
      recurringEligible: false,
      rebookingBehavior: "suggest_next",
      priceFloor: 175,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: ["Premium Detail"],
    },
    {
      name: "Full Detail",
      description: "A complete inside-and-out detail for clients wanting their vehicle thoroughly cleaned, refreshed, and protected. Best all-around package for most vehicles. Includes exterior hand wash, wheels/tires/wheel wells, tire dressing, exterior glass, interior deep vacuum, interior panels/console/door panels, seats/carpets/mats/cargo, interior glass, door jambs, light stain treatment, basic exterior protection, and final inspection.",
      category: "Complete Detail",
      basePrice: 285,
      pricingBySize: { small: 250, medium: 285, large: 325, extra_large: 375 },
      estimatedDuration: 270,
      bufferTimeMinutes: 30,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 90,
      recurringEligible: false,
      rebookingBehavior: "require_next_prompt",
      priceFloor: 250,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: ["Premium Detail"],
    },
    {
      name: "Premium Detail",
      description: "Our most complete non-coating detail package for clients wanting a higher-level finish, deeper cleaning, and upgraded protection. Includes everything in the Full Detail plus enhanced exterior wash process, paint decontamination, clay treatment where needed, upgraded paint protection, detailed wheel and tire cleaning, more detailed interior cleaning, leather/plastic/vinyl conditioning, light spot/stain treatment, and final quality inspection.",
      category: "Premium Detail",
      basePrice: 425,
      pricingBySize: { small: 375, medium: 425, large: 475, extra_large: 550 },
      estimatedDuration: 420,
      bufferTimeMinutes: 30,
      isTaxable: true,
      requiresWaiver: false,
      isActive: true,
      recommendedFrequencyDays: 120,
      recurringEligible: false,
      rebookingBehavior: "require_next_prompt",
      priceFloor: 375,
      packageEligible: true,
      aiRecommendable: true,
      upgradeToNames: [],
    },
  ];

  // Ensure required service categories exist
  const requiredCategories = ["Maintenance", "Interior", "Exterior Protection", "Complete Detail", "Premium Detail"];
  for (const catName of requiredCategories) {
    const catQ = query(collection(db, "categories"), where("name", "==", catName), where("type", "==", "service"));
    const catSnap = await getDocs(catQ);
    if (catSnap.empty) {
      await addDoc(collection(db, "categories"), { name: catName, type: "service", isActive: true, sortOrder: 99 });
    }
  }

  // Pass 1: create or update each service, build name→id map
  const nameToId: Record<string, string> = {};
  let created = 0;
  let updated = 0;

  for (const pkg of packages) {
    const { upgradeToNames, ...fields } = pkg;
    const q = query(collection(db, "services"), where("name", "==", pkg.name));
    const snap = await getDocs(q);
    if (snap.empty) {
      const ref = await addDoc(collection(db, "services"), { ...fields, upgradeToServiceIds: [] });
      nameToId[pkg.name] = ref.id;
      created++;
    } else {
      const existing = snap.docs[0].data();
      await setDoc(doc(db, "services", snap.docs[0].id), {
        ...existing,
        ...fields,
        // preserve deposit/warranty settings from existing doc
        depositRequired: existing.depositRequired ?? false,
        depositType: existing.depositType,
        depositAmount: existing.depositAmount,
        hasWarranty: existing.hasWarranty ?? false,
        warrantyLengthMonths: existing.warrantyLengthMonths,
        warrantyType: existing.warrantyType,
        warrantyCoverageDetails: existing.warrantyCoverageDetails,
        warrantyMaintenanceRequired: existing.warrantyMaintenanceRequired,
        maintenanceReturnEnabled: existing.maintenanceReturnEnabled ?? false,
        maintenanceIntervalDays: existing.maintenanceIntervalDays,
        maintenanceIntervalMonths: existing.maintenanceIntervalMonths,
      });
      nameToId[pkg.name] = snap.docs[0].id;
      updated++;
    }
  }

  // Pass 2: write upgradeToServiceIds now that all IDs are known
  for (const pkg of packages) {
    const id = nameToId[pkg.name];
    if (!id) continue;
    const upgradeIds = pkg.upgradeToNames.map(n => nameToId[n]).filter(Boolean);
    await updateDoc(doc(db, "services", id), { upgradeToServiceIds: upgradeIds });
  }

  // Pass 3: deactivate every service whose name is NOT in the approved set.
  // This handles (Demo) services, old renamed variants (e.g. "Clay & Seal Exterior ONLY",
  // "Level I (Deep Clean)", "Level II (Clay & Seal)"), and any other non-canonical entries.
  const approvedNames = new Set(packages.map(p => p.name));
  const allSnap = await getDocs(collection(db, "services"));
  const batch = writeBatch(db);
  let deactivated = 0;
  for (const d of allSnap.docs) {
    const name = (d.data().name as string) || "";
    if (!approvedNames.has(name) && d.data().isActive !== false) {
      batch.update(d.ref, { isActive: false });
      deactivated++;
    }
  }
  await batch.commit();

  console.log(`[installDetailFlowServices] created=${created} updated=${updated} deactivated=${deactivated}`);
  return { created, updated, deactivated };
}
