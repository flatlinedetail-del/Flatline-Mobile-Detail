import { collection, query, where, getDocs, or, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { Appointment, Customer, Vendor, Lead } from "../types";

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
export async function globalSearch(searchTerm: string): Promise<SearchResult[]> {
  if (!searchTerm || searchTerm.length < 2) return [];

  const results: SearchResult[] = [];
  const term = searchTerm.toLowerCase();

  // 1. Search Customers
  const customerQuery = query(
    collection(db, "customers"),
    limit(10)
  );
  const customerSnap = await getDocs(customerQuery);
  customerSnap.docs.forEach(doc => {
    const data = doc.data() as Customer;
    if (
      data.name?.toLowerCase().includes(term) ||
      data.phone?.includes(term) ||
      data.email?.toLowerCase().includes(term)
    ) {
      results.push({
        type: "customer",
        id: doc.id,
        title: data.name || "Unnamed Customer",
        subtitle: `${data.phone || "No phone"} • ${data.email || "No email"}`,
      });
    }
  });

  // 2. Search Appointments (VIN, RO, Customer Name)
  const appQuery = query(
    collection(db, "appointments"),
    limit(20)
  );
  const appSnap = await getDocs(appQuery);
  appSnap.docs.forEach(doc => {
    const data = doc.data() as Appointment;
    if (
      data.customerName?.toLowerCase().includes(term) ||
      data.vin?.toLowerCase().includes(term) ||
      data.roNumber?.toLowerCase().includes(term) ||
      data.vehicleInfo?.toLowerCase().includes(term) ||
      doc.id.toLowerCase().includes(term)
    ) {
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
  const vendorQuery = query(
    collection(db, "vendors"),
    limit(5)
  );
  const vendorSnap = await getDocs(vendorQuery);
  vendorSnap.docs.forEach(doc => {
    const data = doc.data() as Vendor;
    if (
      data.name?.toLowerCase().includes(term) ||
      data.contactPerson?.toLowerCase().includes(term) ||
      data.phone?.includes(term)
    ) {
      results.push({
        type: "vendor",
        id: doc.id,
        title: data.name || "Unnamed Vendor",
        subtitle: `Contact: ${data.contactPerson || "N/A"} • ${data.phone || "No phone"}`,
      });
    }
  });

  return results;
}
