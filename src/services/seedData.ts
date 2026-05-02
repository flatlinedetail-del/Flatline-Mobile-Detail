import { collection, addDoc, serverTimestamp, Timestamp, getDocs, query, where, doc, setDoc, deleteDoc } from "firebase/firestore";
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
