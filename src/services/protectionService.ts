import { ProtectedClient } from "../types";

export const normalizePhone = (phone: string) => phone.replace(/\D/g, '').replace(/^1/, '');
export const normalizeEmail = (email: string) => email.toLowerCase().trim();
export const normalizeVin = (vin: string) => vin.toUpperCase().replace(/\s/g, '');
export const normalizeLicensePlate = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const checkProtectionMatch = (bookingData: any, protectedClients: ProtectedClient[]) => {
  const normPhone = normalizePhone(bookingData.phone || "");
  const normEmail = normalizeEmail(bookingData.email || "");
  const normVin = normalizeVin(bookingData.vin || "");
  const normPlate = normalizeLicensePlate(bookingData.licensePlate || "");

  for (const client of protectedClients) {
    if (!client.isActive) continue;

    // Strong matches
    if (normPhone && client.phone && normalizePhone(client.phone) === normPhone && normPhone.length > 5) return client;
    if (normEmail && client.email && normalizeEmail(client.email) === normEmail && normEmail.length > 3) return client;
    if (normVin && client.vin && normalizeVin(client.vin) === normVin && normVin.length > 5) return client;
    if (normPlate && client.licensePlate && normalizeLicensePlate(client.licensePlate) === normPlate && normPlate.length > 3) return client;
  }
  return null;
};
