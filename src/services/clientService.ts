import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  writeBatch,
  where,
  orderBy,
  onSnapshot,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, ClientType, ClientCategory, Customer, Vendor } from "../types";
import { getClientDisplayName } from "../lib/utils";

const CLIENTS_COL = "clients";
const CLIENT_TYPES_COL = "client_types";
const CLIENT_CATEGORIES_COL = "client_categories";

export const getClientTypes = async () => {
  const q = query(collection(db, CLIENT_TYPES_COL), orderBy("sortOrder", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientType));
};

export const getClientCategories = async () => {
  const q = query(collection(db, CLIENT_CATEGORIES_COL), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientCategory));
};

export const ensureClientTypes = async () => {
  const existingTypes = await getClientTypes();
  if (existingTypes.length === 0) {
    const types = [
      { name: "Retail", slug: "retail", isActive: true, sortOrder: 1 },
      { name: "Business", slug: "business", isActive: true, sortOrder: 2 },
      { name: "Collision Center", slug: "collision_center", isActive: true, sortOrder: 3 },
      { name: "Dealership", slug: "dealership", isActive: true, sortOrder: 4 },
      { name: "Organization", slug: "organization", isActive: true, sortOrder: 5 },
      { name: "Fleet", slug: "fleet", isActive: true, sortOrder: 6 },
    ];

    const batch = writeBatch(db);
    for (const type of types) {
      const newDoc = doc(collection(db, CLIENT_TYPES_COL));
      batch.set(newDoc, type);
    }
    await batch.commit();
    return await getClientTypes();
  }
  
  // Remove duplicates if any (by slug)
  const uniqueTypes: ClientType[] = [];
  const slugs = new Set();
  for (const type of existingTypes) {
    if (!slugs.has(type.slug)) {
      slugs.add(type.slug);
      uniqueTypes.push(type);
    }
  }
  return uniqueTypes;
};

export const createDefaultClientTypes = async () => {
  const types = [
    { name: "Retail", slug: "retail", isActive: true, sortOrder: 1 },
    { name: "Business", slug: "business", isActive: true, sortOrder: 2 },
    { name: "Collision Center", slug: "collision_center", isActive: true, sortOrder: 3 },
    { name: "Dealership", slug: "dealership", isActive: true, sortOrder: 4 },
    { name: "Organization", slug: "organization", isActive: true, sortOrder: 5 },
    { name: "Fleet", slug: "fleet", isActive: true, sortOrder: 6 },
  ];

  const batch = writeBatch(db);
  for (const type of types) {
    const newDoc = doc(collection(db, CLIENT_TYPES_COL));
    batch.set(newDoc, type);
  }
  await batch.commit();
};

export const migrateDataToClients = async () => {
  // 1. Ensure default types exist
  const existingTypes = await getClientTypes();
  if (existingTypes.length === 0) {
    await createDefaultClientTypes();
  }
  const types = await getClientTypes();
  const retailType = types.find(t => t.slug === "retail");
  const businessType = types.find(t => t.slug === "business");

  if (!retailType || !businessType) throw new Error("Default client types missing");

  // 2. Fetch all customers and vendors
  const customersSnap = await getDocs(collection(db, "customers"));
  const vendorsSnap = await getDocs(collection(db, "vendors"));

  const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
  const vendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));

  const batch = writeBatch(db);
  const migrationMap: Record<string, string> = {}; // oldId -> newClientId

  // 3. Migrate Customers
  for (const cust of customers) {
    const clientRef = doc(collection(db, CLIENTS_COL));
    const nameParts = cust.name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    const clientData: Partial<Client> = {
      name: cust.name,
      firstName,
      lastName,
      email: cust.email,
      phone: cust.phone,
      address: cust.address,
      latitude: cust.latitude,
      longitude: cust.longitude,
      clientTypeId: retailType.id,
      categoryIds: [],
      loyaltyPoints: cust.loyaltyPoints || 0,
      membershipLevel: cust.membershipLevel || "none",
      isVIP: cust.isVIP || false,
      vipSettings: cust.vipSettings || {},
      notes: cust.notes || "",
      createdAt: cust.createdAt || serverTimestamp(),
      legacyId: cust.id,
      legacyType: "customer"
    };
    batch.set(clientRef, clientData);
    migrationMap[cust.id] = clientRef.id;
  }

  // 4. Migrate Vendors
  for (const vend of vendors) {
    const clientRef = doc(collection(db, CLIENTS_COL));
    const contactParts = (vend.contactPerson || "").trim().split(/\s+/);
    const firstName = contactParts[0] || "";
    const lastName = contactParts.length > 1 ? contactParts.slice(1).join(" ") : "";

    const clientData: Partial<Client> = {
      name: vend.name,
      businessName: vend.name,
      firstName,
      lastName,
      contactPerson: vend.contactPerson,
      email: vend.email,
      phone: vend.phone,
      address: vend.address,
      latitude: vend.latitude,
      longitude: vend.longitude,
      clientTypeId: businessType.id,
      categoryIds: [],
      billingCycle: vend.billingCycle || "monthly",
      customRates: vend.vendorRates || {},
      notes: vend.notes || "",
      createdAt: vend.createdAt || serverTimestamp(),
      legacyId: vend.id,
      legacyType: "vendor"
    };
    batch.set(clientRef, clientData);
    migrationMap[vend.id] = clientRef.id;
  }

  await batch.commit();

  // 5. Update Appointments and Vehicles (in chunks if needed, but let's try batch first)
  const appointmentsSnap = await getDocs(collection(db, "appointments"));
  const vehiclesSnap = await getDocs(collection(db, "vehicles"));

  const updateBatch = writeBatch(db);
  
  appointmentsSnap.docs.forEach(d => {
    const data = d.data();
    const oldId = data.customerId || data.vendorId;
    if (oldId && migrationMap[oldId]) {
      updateBatch.update(d.ref, { 
        clientId: migrationMap[oldId],
        customerType: "client" 
      });
    }
  });

  vehiclesSnap.docs.forEach(d => {
    const data = d.data();
    const oldId = data.ownerId;
    if (oldId && migrationMap[oldId]) {
      updateBatch.update(d.ref, { 
        clientId: migrationMap[oldId],
        ownerType: "client"
      });
    }
  });

  await updateBatch.commit();
  return { migratedCount: Object.keys(migrationMap).length };
};

export const ensureClientNameFields = async () => {
  const q = query(collection(db, CLIENTS_COL));
  const snap = await getDocs(q);
  const typesSnap = await getDocs(collection(db, CLIENT_TYPES_COL));
  const types = typesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientType));
  
  const batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    const data = d.data() as Client;
    if (!data.firstName && !data.lastName && !data.businessName && data.name) {
      const type = types.find(t => t.id === data.clientTypeId);
      const updates: Partial<Client> = {};
      
      if (type?.slug === "retail") {
        const parts = data.name.trim().split(/\s+/);
        if (parts.length >= 2) {
          updates.firstName = parts[0];
          updates.lastName = parts.slice(1).join(" ");
        } else {
          updates.firstName = data.name;
        }
      } else {
        updates.businessName = data.name;
        if (data.contactPerson) {
          const parts = data.contactPerson.trim().split(/\s+/);
          if (parts.length >= 2) {
            updates.firstName = parts[0];
            updates.lastName = parts.slice(1).join(" ");
          } else {
            updates.firstName = data.contactPerson;
          }
        }
      }
      
      if (Object.keys(updates).length > 0) {
        batch.update(d.ref, updates);
        count++;
        
        // Also update related appointments for this client
        const appointmentsQuery = query(
          collection(db, "appointments"), 
          where("clientId", "==", d.id)
        );
        const appointmentsSnap = await getDocs(appointmentsQuery);
        
        // Derive the new display name for appointments
        const fullClientData = { ...data, ...updates };
        const newDisplayName = getClientDisplayName(fullClientData);
        
        appointmentsSnap.docs.forEach(appDoc => {
          batch.update(appDoc.ref, { customerName: newDisplayName });
        });
      }
    }
  }

  if (count > 0) {
    await batch.commit();
  }
  return count;
};
