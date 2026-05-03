export type WarrantyStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'VOIDED' | 'AT_RISK' | 'CLAIM_OPEN' | 'CLAIM_RESOLVED';

export interface Warranty {
  id?: string;
  clientId: string;
  vehicleId: string;
  jobId: string;
  invoiceId: string;
  serviceId: string;
  serviceName: string;

  warrantyType: string;
  warrantyLengthMonths: number;

  startDate: number;
  expirationDate: number;

  status: WarrantyStatus;

  coverageDetails: string;
  exclusions: string;

  maintenanceRequired: boolean;
  maintenanceIntervalDays: number;
  lastMaintenanceDate: number | null;
  nextMaintenanceDate: number | null;
  missedMaintenance: boolean;

  createdAt: number;
  updatedAt: number;
  
  _pendingSync?: boolean;
}

export type ClaimStatus = 'OPEN' | 'APPROVED' | 'DENIED' | 'RESOLVED';

export interface WarrantyClaim {
  id?: string;
  warrantyId: string;
  clientId: string;
  vehicleId: string;
  claimDate: number;
  issueDescription: string;
  photos: string[];
  inspectionNotes: string;
  status: ClaimStatus;
  createdAt: number;
  updatedAt: number;
}
