import { collection, query, where, getDocs, addDoc, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Lead, Client, Appointment, Quote, BusinessSettings } from "../types";
import { qualifyLeadAI } from "./gemini";
import { calculateDistance } from "./travelService";
import { createDocMetadata, getBaseQuery } from "../lib/firestoreUtils";

export interface LeadGenerationParams {
  type: "collision_center" | "dealership" | "fleet" | "rental" | "commercial" | "retail";
  location: string;
  radius: number;
}

/**
 * AI Lead Service
 * Handles lead scoring, classification, outreach generation, and internal lead discovery.
 */
export const aiLeadService = {
  /**
   * Scores and classifies a lead using Gemini
   */
  async qualifyLead(lead: Partial<Lead>, businessId: string): Promise<Partial<Lead>> {
    const aiData = await qualifyLeadAI(lead);
    
    // Add distance awareness if coordinates are available
    let distanceFromBase = undefined;
    let isOutsideRadius = false;

    if (lead.latitude && lead.longitude) {
      const settingsSnap = await getDoc(doc(db, "settings", businessId));
      if (settingsSnap.exists()) {
        const settings = settingsSnap.data() as BusinessSettings;
        if (settings.baseLatitude && settings.baseLongitude) {
          distanceFromBase = calculateDistance(
            settings.baseLatitude,
            settings.baseLongitude,
            lead.latitude,
            lead.longitude
          );
          // Flag if outside 50 miles (default max)
          isOutsideRadius = distanceFromBase > 50;
        }
      }
    }

    return {
      ...lead,
      ...aiData,
      distanceFromBase,
      notes: isOutsideRadius ? `[OUTSIDE RADIUS] ${lead.notes || ""}` : lead.notes
    };
  },

  /**
   * Scans internal data to find new lead opportunities
   */
  async generateInternalLeads(businessId: string): Promise<Lead[]> {
    const newLeads: Lead[] = [];
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 1. Inactive Clients (no appointment in 90 days)
    // Fetch all clients and all appointments once to avoid N+1 queries
    const [clientsSnap, appsSnap] = await Promise.all([
      getDocs(query(collection(db, "clients"), ...getBaseQuery(businessId))),
      getDocs(query(collection(db, "appointments"), ...getBaseQuery(businessId)))
    ]);

    const appointmentsByClient: Record<string, Appointment[]> = {};
    appsSnap.docs.forEach(doc => {
      const app = doc.data() as Appointment;
      const clientId = app.clientId || app.customerId; // Handle both legacy and new
      if (clientId) {
        if (!appointmentsByClient[clientId]) {
          appointmentsByClient[clientId] = [];
        }
        appointmentsByClient[clientId].push(app);
      }
    });

    clientsSnap.docs.forEach(clientDoc => {
      const client = clientDoc.data() as Client;
      const clientId = clientDoc.id;
      
      const clientApps = appointmentsByClient[clientId] || [];
      
      let isInactive = false;
      if (clientApps.length === 0) {
        isInactive = true;
      } else {
        const lastApp = clientApps[0];
        const lastDate = lastApp.scheduledAt.toDate();
        if (lastDate < ninetyDaysAgo) {
          isInactive = true;
        }
      }

      if (isInactive) {
        newLeads.push(this.mapClientToLead(client, "inactive", businessId));
      }
    });

    // 2. Unaccepted Quotes
    const quotesQuery = query(
        collection(db, "quotes"), 
        ...getBaseQuery(businessId),
        where("status", "==", "sent")
    );
    const quotesSnap = await getDocs(quotesQuery);
    quotesSnap.docs.forEach(quoteDoc => {
      const quote = quoteDoc.data() as Quote;
      // If quote is older than 3 days, it's a lead
      const createdAt = (quote.createdAt as any).toDate();
      if (createdAt < new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)) {
        newLeads.push(this.mapQuoteToLead(quote, businessId));
      }
    });

    return newLeads;
  },

  mapClientToLead(client: Client, type: "inactive" | "maintenance", businessId: string): any {
    const metadata = createDocMetadata(businessId);
    return {
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      source: `Internal: ${type}`,
      status: "reactivation",
      priority: "medium",
      isInternal: true,
      internalSourceType: type,
      notes: client.notes || "",
      ...metadata
    };
  },

  mapQuoteToLead(quote: Quote, businessId: string): any {
    const metadata = createDocMetadata(businessId);
    return {
      name: quote.clientName,
      email: quote.clientEmail || "",
      phone: quote.clientPhone || "",
      address: quote.clientAddress || "",
      source: "Internal: Quote Follow-up",
      status: "quoted",
      priority: "high",
      isInternal: true,
      internalSourceType: "quote_followup",
      notes: `Quote Total: $${quote.total}. Services: ${quote.lineItems.map(li => li.serviceName).join(", ")}`,
      ...metadata
    };
  }
};
