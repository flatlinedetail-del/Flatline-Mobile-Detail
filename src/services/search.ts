import { collection, query, where, getDocs, or, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { Appointment, Customer, Vendor, Lead } from "../types";
import { getBaseQuery } from "../lib/firestoreUtils";

export interface SearchResult {
  type: "appointment" | "customer" | "vendor" | "lead";
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  date?: string;
  amount?: number;
}

/**
 * Global Search Logic
 * Searches across multiple collections: customers, vendors, appointments, leads
 * Matches by name, VIN, RO, phone, vehicle, invoice number
 */
export async function globalSearch(businessId: string, searchTerm: string): Promise<SearchResult[]> {
  if (!searchTerm || searchTerm.length < 2) return [];

  const results: SearchResult[] = [];
  const term = searchTerm.toLowerCase();

  try {
    // 1. Search Clients
    const clientsSnap = await getDocs(query(collection(db, "clients"), ...getBaseQuery(businessId)));
    clientsSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const combined = `${data.name} ${data.firstName} ${data.lastName} ${data.businessName} ${data.phone}`.toLowerCase();
      if (combined.includes(term)) {
        results.push({
          type: "customer",
          id: doc.id,
          title: data.name || "Unnamed Client",
          subtitle: `${data.phone || "No phone"} • ${data.email || "No email"}`,
        });
      }
    });

    // 2. Search Appointments
    const appsSnap = await getDocs(query(collection(db, "appointments"), ...getBaseQuery(businessId)));
    appsSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const combined = `${data.customerName} ${data.vin} ${data.roNumber} ${data.vehicleInfo} ${doc.id}`.toLowerCase();
      if (combined.includes(term)) {
        results.push({
          type: "appointment",
          id: doc.id,
          title: `Job #${doc.id.slice(-6).toUpperCase()}`,
          subtitle: `${data.customerName || "Unknown"} • ${data.vehicleInfo || "Unknown Vehicle"}`,
          status: data.status,
          amount: data.totalAmount,
        });
      }
    });

    // 3. Search Vendors
    const vendorsSnap = await getDocs(query(collection(db, "vendors"), ...getBaseQuery(businessId)));
    vendorsSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const combined = `${data.name} ${data.contactPerson} ${data.phone}`.toLowerCase();
      if (combined.includes(term)) {
        results.push({
          type: "vendor",
          id: doc.id,
          title: data.name || "Unnamed Vendor",
          subtitle: `Contact: ${data.contactPerson || "N/A"} • ${data.phone || "No phone"}`,
        });
      }
    });

    // 4. Search Leads
    const leadsSnap = await getDocs(query(collection(db, "leads"), ...getBaseQuery(businessId)));
    leadsSnap.docs.forEach(doc => {
      const data = doc.data() as any;
      const combined = `${data.name} ${data.email} ${data.phone} ${data.vehicleInfo}`.toLowerCase();
      if (combined.includes(term)) {
        results.push({
          type: "lead",
          id: doc.id,
          title: data.name || "Unnamed Lead",
          subtitle: `${data.phone || "No phone"} • ${data.source || "Direct"}`,
        });
      }
    });

  } catch (error) {
    console.error("Global search error:", error);
  }

  return results.slice(0, 10);
}
