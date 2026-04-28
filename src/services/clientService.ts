import { 
  collection, 
  query, 
  getDocs,
  getDoc,
  doc, 
  setDoc,
  updateDoc,
  serverTimestamp, 
  writeBatch,
  orderBy,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, ClientType, ClientCategory, Customer, Vendor } from "../types";
import { createDocMetadata, updateDocMetadata, getBaseQuery } from "../lib/firestoreUtils";
import { getClientDisplayName } from "../lib/utils";
import { batchUpdateClientAppointmentsName } from "./appointmentService";

const CLIENTS_COL = "clients";
const CLIENT_TYPES_COL = "client_types";
const CLIENT_CATEGORIES_COL = "client_categories";

export const getClient = async (clientId: string): Promise<Client | null> => {
  const clientRef = doc(db, CLIENTS_COL, clientId);
  const snap = await getDoc(clientRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Client;
};

export const getClientTypes = async (): Promise<ClientType[]> => {
  const q = query(collection(db, CLIENT_TYPES_COL));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientType));
};

export const getClientCategories = async (): Promise<ClientCategory[]> => {
  const q = query(collection(db, CLIENT_CATEGORIES_COL));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientCategory));
};

export const calculateRiskScore = (client: Client): { score: number; level: "low" | "medium" | "high" } => {
  const score = (client.noShows * 40) + (client.latePayments * 30) + (client.cancellations * 10);
  let level: "low" | "medium" | "high" = "low";
  if (score > 70) level = "high";
  else if (score > 30) level = "medium";
  return { score, level };
};

export const updateClientRiskStats = async (clientId: string, type: "noShow" | "latePayment" | "cancellation") => {
  const clientRef = doc(db, CLIENTS_COL, clientId);
  const snap = await getDoc(clientRef);
  if (!snap.exists()) return;
  const client = { id: snap.id, ...snap.data() } as Client;

  const updates: Partial<Client> = {};
  if (type === "noShow") updates.noShows = (client.noShows || 0) + 1;
  else if (type === "latePayment") updates.latePayments = (client.latePayments || 0) + 1;
  else if (type === "cancellation") updates.cancellations = (client.cancellations || 0) + 1;

  const { score, level } = calculateRiskScore({ ...client, ...updates } as Client);
  
  await updateDoc(clientRef, { ...updates, riskScore: score, riskLevel: level });
};

export const findMatchingClient = async (
  businessId: string, 
  details: { email?: string; phone?: string; name?: string; vehicle?: { vin?: string; licensePlate?: string } }
): Promise<Client | null> => {
  const allClients = await getClients(businessId);
  
  let bestMatch: Client | null = null;
  let highestScore = 0;

  for (const client of allClients) {
    let score = 0;
    
    if (details.email && client.email && client.email.toLowerCase() === details.email.toLowerCase()) score += 50;
    if (details.phone && client.phone && client.phone === details.phone) score += 40;
    if (details.name && client.name && client.name.toLowerCase().includes(details.name.toLowerCase())) score += 20;

    // TODO: Verify vehicles for this client?
    
    if (score > highestScore && score >= 40) {
      highestScore = score;
      bestMatch = client;
    }
  }
  
  return bestMatch;
};

export const getDepositRequirement = (client: Client | null): { amount: number; type: "fixed" | "percentage"; reason: string } => {
  if (!client || client.riskLevel === 'low') {
    return { amount: 0, type: "fixed", reason: "Standard deposit" };
  }
  
  if (client.riskLevel === 'medium') {
    return { amount: 25, type: "percentage", reason: "Increased risk deposit" };
  }
  
  return { amount: 50, type: "percentage", reason: "Required high-risk deposit" };
};

export const getClients = async (businessId: string): Promise<Client[]> => {
  const q = query(
    collection(db, CLIENTS_COL),
    ...getBaseQuery(businessId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
};

export const createClient = async (clientData: Partial<Client>, businessId: string): Promise<string> => {
  const clientRef = doc(collection(db, CLIENTS_COL));
  const data = createDocMetadata(businessId);
  await setDoc(clientRef, { ...clientData, ...data });
  return clientRef.id;
};

export const updateClient = async (clientId: string, clientData: Partial<Client>) => {
  const clientRef = doc(db, CLIENTS_COL, clientId);
  const data = updateDocMetadata();
  await updateDoc(clientRef, { ...clientData, ...data });
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

export const ensureClientNameFields = async (businessId: string) => {
  const q = query(collection(db, CLIENTS_COL), ...getBaseQuery(businessId));
  const snap = await getDocs(q);
  const typesSnap = await getDocs(query(collection(db, CLIENT_TYPES_COL), ...getBaseQuery(businessId)));
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
        const fullClientData = { ...data, ...updates };
        const newDisplayName = getClientDisplayName(fullClientData);
        await batchUpdateClientAppointmentsName(batch, businessId, d.id, newDisplayName);
      }
    }
  }

  if (count > 0) {
    await batch.commit();
  }
  return count;
};
