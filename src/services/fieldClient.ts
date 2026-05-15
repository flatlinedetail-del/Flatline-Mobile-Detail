import type { Client } from "../types";

/**
 * Lightweight adapter mapping the canonical `Client` document
 * (Firestore `clients` collection, defined in src/types/index.ts)
 * into a slim "FieldClient" view-model for the phone Field Mode UI.
 *
 * Not a duplicate store — every read still hits the same `clients`
 * collection used by the desktop Clients page. This adapter only
 * normalises optional fields and pre-computes deep links so the UI
 * stays simple.
 */
export interface FieldClient {
  id: string;
  name: string;
  businessName?: string;
  phone?: string;
  email?: string;
  address?: string;
  isVIP: boolean;
  isOneTime?: boolean;
  membershipLevel: "none" | "silver" | "gold" | "platinum";
  riskLevel?: "low" | "medium" | "high";
  loyaltyPoints?: number;
  lastServiceDate?: string;
  serviceHistoryCount?: number;
  lastServiceType?: string;
  totalHistoricalSpend?: number;
  telUrl?: string;
  smsUrl?: string;
  mailtoUrl?: string;
}

export function toFieldClient(raw: Client | (Partial<Client> & Record<string, unknown>)): FieldClient {
  const r = raw as Partial<Client> & Record<string, unknown>;

  const trim = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s.length ? s : undefined;
  };

  const phone = trim(r.phone);
  const email = trim(r.email);

  const validMembership = (v: unknown): "none" | "silver" | "gold" | "platinum" => {
    if (v === "silver" || v === "gold" || v === "platinum") return v;
    return "none";
  };

  const validRisk = (v: unknown): "low" | "medium" | "high" | undefined => {
    if (v === "low" || v === "medium" || v === "high") return v;
    return undefined;
  };

  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? r.businessName ?? "Unnamed client"),
    businessName: trim(r.businessName),
    phone,
    email,
    address: trim(r.address),
    isVIP: Boolean(r.isVIP),
    isOneTime: Boolean(r.isOneTime),
    membershipLevel: validMembership(r.membershipLevel),
    riskLevel: validRisk(r.riskLevel),
    loyaltyPoints: typeof r.loyaltyPoints === "number" ? r.loyaltyPoints : undefined,
    lastServiceDate: trim((r as Record<string, unknown>).lastServiceDate as string | undefined),
    serviceHistoryCount:
      typeof r.serviceHistoryCount === "number" ? r.serviceHistoryCount : undefined,
    lastServiceType: trim(r.lastServiceType),
    totalHistoricalSpend:
      typeof r.totalHistoricalSpend === "number" ? (r.totalHistoricalSpend as number) : undefined,
    telUrl: phone ? `tel:${phone}` : undefined,
    smsUrl: phone ? `sms:${phone}` : undefined,
    mailtoUrl: email ? `mailto:${email}` : undefined,
  };
}
