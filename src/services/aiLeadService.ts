import { collection, query, where, getDocs, Timestamp, addDoc, serverTimestamp, orderBy, limit, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Lead, Client, Appointment, Quote, BusinessSettings, ServiceHistoryEntry } from "../types";
import { qualifyLeadAI } from "./gemini";
import { calculateDistance } from "./travelService";

async function getClientServiceHistory(clientId: string): Promise<ServiceHistoryEntry[]> {
  try {
    const snap = await getDocs(query(
      collection(db, "client_service_history"),
      where("clientId", "==", clientId),
      orderBy("serviceDate", "desc"),
      limit(50)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceHistoryEntry));
  } catch {
    return [];
  }
}

function computeMarketingIntelligence(
  client: Client,
  serviceHistory: ServiceHistoryEntry[],
  completedAppointments: Appointment[]
) {
  const jobEntries: ServiceHistoryEntry[] = completedAppointments
    .filter(a => a.status === "completed" || a.status === "paid")
    .map(a => ({
      id: a.id,
      clientId: client.id,
      serviceType: Array.isArray((a as any).serviceNames) ? (a as any).serviceNames.join(", ") : (a as any).serviceName || "Service",
      serviceDate: a.scheduledAt instanceof Timestamp ? a.scheduledAt.toDate().toISOString().split("T")[0] : String(a.scheduledAt),
      priceCharged: a.totalAmount,
      source: "completed_job" as const,
    }));

  const allHistory = [...serviceHistory, ...jobEntries].sort(
    (a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime()
  );

  const latest = allHistory[0];
  const totalSpend = allHistory.reduce((s, e) => s + (e.priceCharged || 0), 0);
  const svcTypes = allHistory.map(e => e.serviceType).filter(Boolean);
  const preferred = svcTypes.length
    ? svcTypes.sort((a, b) => svcTypes.filter(t => t === b).length - svcTypes.filter(t => t === a).length)[0]
    : undefined;

  let avgInterval: number | undefined;
  if (allHistory.length >= 2) {
    const intervals: number[] = [];
    for (let i = 0; i < allHistory.length - 1; i++) {
      const diff = new Date(allHistory[i].serviceDate).getTime() - new Date(allHistory[i + 1].serviceDate).getTime();
      intervals.push(Math.abs(Math.round(diff / (1000 * 60 * 60 * 24))));
    }
    avgInterval = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
  }

  let nextRecommended: string | undefined;
  if (latest && avgInterval) {
    const next = new Date(latest.serviceDate);
    next.setDate(next.getDate() + avgInterval);
    nextRecommended = next.toISOString().split("T")[0];
  }

  const daysSinceLast = latest
    ? Math.round((Date.now() - new Date(latest.serviceDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    lastServiceDate: latest?.serviceDate || client.lastServiceDate || "",
    lastServiceType: latest?.serviceType || client.lastServiceType || "",
    totalHistoricalSpend: totalSpend || client.totalHistoricalSpend || 0,
    serviceHistoryCount: allHistory.length,
    preferredServiceType: preferred || client.preferredServiceType,
    averageServiceInterval: avgInterval || client.averageServiceInterval,
    nextRecommendedServiceDate: nextRecommended || client.nextRecommendedServiceDate,
    marketingEligibleServices: [...new Set(svcTypes)],
    daysSinceLast,
    isDueForService: nextRecommended ? new Date(nextRecommended) <= new Date() : (daysSinceLast !== null && daysSinceLast >= 90),
  };
}

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
  async qualifyLead(lead: Partial<Lead>): Promise<Partial<Lead>> {
    const aiData = await qualifyLeadAI(lead);
    
    // Add distance awareness if coordinates are available
    let distanceFromBase = undefined;
    let isOutsideRadius = false;

    if (lead.latitude && lead.longitude) {
      const settingsSnap = await getDoc(doc(db, "settings", "business"));
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
  async generateInternalLeads(): Promise<Lead[]> {
    const newLeads: Lead[] = [];
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 1. Inactive Clients (no appointment in 90 days)
    // Fetch all clients and all appointments once to avoid N+1 queries
    const [clientsSnap, appsSnap] = await Promise.all([
      getDocs(collection(db, "clients")),
      getDocs(query(collection(db, "appointments"), orderBy("scheduledAt", "desc")))
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

    for (const clientDoc of clientsSnap.docs) {
      const client = { id: clientDoc.id, ...clientDoc.data() } as Client;
      const clientId = clientDoc.id;
      const clientApps = appointmentsByClient[clientId] || [];

      let isInactive = false;
      if (clientApps.length === 0) {
        const lastManualDate = client.lastServiceDate ? new Date(client.lastServiceDate) : null;
        if (!lastManualDate || lastManualDate < ninetyDaysAgo) {
          isInactive = true;
        }
      } else {
        const lastApp = clientApps[0];
        const lastDate = lastApp.scheduledAt.toDate();
        if (lastDate < ninetyDaysAgo) {
          isInactive = true;
        }
      }

      if (isInactive) {
        const serviceHistory = await getClientServiceHistory(clientId);
        const intel = computeMarketingIntelligence(client, serviceHistory, clientApps);
        newLeads.push(this.mapClientToLead({ ...client, ...intel }, "inactive", intel));
      }
    }

    // 2. Unaccepted Quotes
    const quotesQuery = query(collection(db, "quotes"), where("status", "==", "sent"));
    const quotesSnap = await getDocs(quotesQuery);
    quotesSnap.docs.forEach(quoteDoc => {
      const quote = quoteDoc.data() as Quote;
      // If quote is older than 3 days, it's a lead
      const createdAt = (quote.createdAt as Timestamp).toDate();
      if (createdAt < new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)) {
        newLeads.push(this.mapQuoteToLead(quote));
      }
    });

    return newLeads;
  },

  mapClientToLead(client: Client, type: "inactive" | "maintenance", intel?: ReturnType<typeof computeMarketingIntelligence>): any {
    const daysSinceLast = intel?.daysSinceLast;
    const lastType = intel?.lastServiceType || (client as any).lastServiceType || "";
    const preferred = intel?.preferredServiceType || (client as any).preferredServiceType || "";
    const nextRec = intel?.nextRecommendedServiceDate || (client as any).nextRecommendedServiceDate || "";
    const totalSpend = intel?.totalHistoricalSpend || (client as any).totalHistoricalSpend || 0;

    let marketingNote = client.notes || "";
    if (lastType) marketingNote += ` | Last Service: ${lastType}`;
    if (daysSinceLast != null) marketingNote += ` | ${daysSinceLast}d since last visit`;
    if (preferred) marketingNote += ` | Prefers: ${preferred}`;
    if (nextRec) marketingNote += ` | Due: ${nextRec}`;
    if (totalSpend > 0) marketingNote += ` | Lifetime: $${totalSpend.toFixed(2)}`;

    return {
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      source: `Internal: ${type}`,
      status: "reactivation",
      priority: daysSinceLast != null && daysSinceLast > 180 ? "high" : "medium",
      isInternal: true,
      internalSourceType: type,
      notes: marketingNote.trim(),
      lastServiceDate: intel?.lastServiceDate || (client as any).lastServiceDate,
      lastServiceType: lastType,
      preferredServiceType: preferred,
      nextRecommendedServiceDate: nextRec,
      totalHistoricalSpend: totalSpend,
      serviceHistoryCount: intel?.serviceHistoryCount ?? (client as any).serviceHistoryCount ?? 0,
      averageServiceInterval: intel?.averageServiceInterval ?? (client as any).averageServiceInterval,
      marketingEligibleServices: intel?.marketingEligibleServices || (client as any).marketingEligibleServices || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  },

  mapQuoteToLead(quote: Quote): any {
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }
};
