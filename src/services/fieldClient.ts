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

  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? r.businessName ?? "Unnamed client"),
    businessName: trim(r.businessName),
    phone,
    email,
    address: trim(r.address),
    isVIP: Boolean(r.isVIP),
    lastServiceType: trim(r.lastServiceType),
    totalHistoricalSpend:
      typeof r.totalHistoricalSpend === "number" ? (r.totalHistoricalSpend as number) : undefined,
    telUrl: phone ? `tel:${phone}` : undefined,
    smsUrl: phone ? `sms:${phone}` : undefined,
    mailtoUrl: email ? `mailto:${email}` : undefined,
  };
}
