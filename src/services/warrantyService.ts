import { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Warranty, WarrantyStatus, WarrantyClaim, ClaimStatus } from '../types/warranty';
import { syncService } from './syncService';

const WARRANTY_COLLECTION = 'warranties';
const CLAIM_COLLECTION = 'warrantyClaims'; // We'll put claims in a root collection so we can query them easily, or a subcollection if needed. Subcollection: warranties/{id}/warrantyClaims.

export const warrantyService = {
  // Evaluates the current status based on dates & logic
  evaluateStatus(w: Warranty): WarrantyStatus {
    if (w.status === 'VOIDED') return 'VOIDED'; // Terminal state
    if (w.status === 'CLAIM_OPEN') return 'CLAIM_OPEN';
    if (w.status === 'CLAIM_RESOLVED') return 'CLAIM_RESOLVED';

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    if (now > w.expirationDate) {
      return 'EXPIRED';
    }

    if (w.maintenanceRequired) {
      if (w.nextMaintenanceDate && now > w.nextMaintenanceDate) {
        return 'AT_RISK';
      }
      if (w.missedMaintenance) {
        return 'AT_RISK';
      }
    }

    if (w.expirationDate - now <= THIRTY_DAYS) {
      return 'EXPIRING_SOON';
    }

    return 'ACTIVE';
  },

  async createWarranty(data: Omit<Warranty, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: WarrantyStatus }): Promise<Warranty> {
    const now = Date.now();
    const newWarranty: Warranty = {
      ...data,
      status: data.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    newWarranty.status = this.evaluateStatus(newWarranty);

    try {
      const docRef = await addDoc(collection(db, WARRANTY_COLLECTION), newWarranty);
      return { id: docRef.id, ...newWarranty };
    } catch (error) {
      console.warn("Offline or error creating warranty", error);
      // Offline fallback
      const tempId = 'temp_' + now;
      const wSync: Warranty = { id: tempId, ...newWarranty, _pendingSync: true };
      
      const cached = JSON.parse(localStorage.getItem('pending_warranties') || '[]');
      cached.push(wSync);
      localStorage.setItem('pending_warranties', JSON.stringify(cached));
      
      return wSync;
    }
  },

  async getWarrantiesForClient(clientId: string): Promise<Warranty[]> {
    try {
      const q = query(collection(db, WARRANTY_COLLECTION), where("clientId", "==", clientId));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Warranty));
      
      // Merge with pending if any
      const pending = JSON.parse(localStorage.getItem('pending_warranties') || '[]') as Warranty[];
      const clientPending = pending.filter(p => p.clientId === clientId);

      // Auto update statuses if changed
      const updatedItems = await Promise.all(items.map(async item => {
        const newStatus = this.evaluateStatus(item);
        if (newStatus !== item.status) {
          item.status = newStatus;
          item.updatedAt = Date.now();
          await this.updateWarranty(item.id!, { status: newStatus });
        }
        return item;
      }));

      return [...updatedItems, ...clientPending];
    } catch (error) {
       console.warn("Offline, returning cached warranties", error);
       const cachedAll = JSON.parse(localStorage.getItem('cached_warranties_all') || '[]') as Warranty[];
       return cachedAll.filter(w => w.clientId === clientId);
    }
  },

  async getWarrantiesForVehicle(vehicleId: string): Promise<Warranty[]> {
    try {
      const q = query(collection(db, WARRANTY_COLLECTION), where("vehicleId", "==", vehicleId));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Warranty));

      const updatedItems = await Promise.all(items.map(async item => {
        const newStatus = this.evaluateStatus(item);
        if (newStatus !== item.status) {
          item.status = newStatus;
          item.updatedAt = Date.now();
          await this.updateWarranty(item.id!, { status: newStatus });
        }
        return item;
      }));
      return updatedItems;
    } catch (e) {
      return [];
    }
  },

  async updateWarranty(id: string, updates: Partial<Warranty>): Promise<void> {
    if (id.startsWith('temp_')) {
      const cached = JSON.parse(localStorage.getItem('pending_warranties') || '[]') as Warranty[];
      const idx = cached.findIndex(w => w.id === id);
      if (idx !== -1) {
        cached[idx] = { ...cached[idx], ...updates, updatedAt: Date.now() };
        localStorage.setItem('pending_warranties', JSON.stringify(cached));
      }
      return;
    }
    
    try {
      await updateDoc(doc(db, WARRANTY_COLLECTION, id), {
        ...updates,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.warn("Offline, enqueueing warranty update", e);
      try {
        await syncService.enqueueTask('warranties', { ...updates, id, updatedAt: Date.now() }, 'update');
      } catch(err) {}
    }
  },

  async logMaintenance(warrantyId: string, w: Warranty): Promise<void> {
    const now = Date.now();
    const nextMaintenance = now + (w.maintenanceIntervalDays * 24 * 60 * 60 * 1000);
    const updates: Partial<Warranty> = {
      lastMaintenanceDate: now,
      nextMaintenanceDate: nextMaintenance,
      missedMaintenance: false,
      status: 'ACTIVE' // Reset status
    };
    
    // Evaluate if it's still expiring soon
    const tempW = { ...w, ...updates };
    updates.status = this.evaluateStatus(tempW as Warranty);

    await this.updateWarranty(warrantyId, updates);
  },

  async createClaim(warrantyId: string, claimData: Omit<WarrantyClaim, 'id' | 'createdAt' | 'updatedAt' | 'warrantyId'>): Promise<WarrantyClaim> {
    const now = Date.now();
    const newClaim: WarrantyClaim = {
      ...claimData,
      warrantyId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const docRef = await addDoc(collection(db, `${WARRANTY_COLLECTION}/${warrantyId}/${CLAIM_COLLECTION}`), newClaim);
      
      // Update warranty status
      await this.updateWarranty(warrantyId, { status: 'CLAIM_OPEN' });
      
      return { id: docRef.id, ...newClaim };
    } catch (e) {
      console.warn("Offline claim creation fallback");
      throw new Error("Must be online to create claims");
    }
  },

  async getClaims(warrantyId: string): Promise<WarrantyClaim[]> {
    try {
      const snap = await getDocs(collection(db, `${WARRANTY_COLLECTION}/${warrantyId}/${CLAIM_COLLECTION}`));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as WarrantyClaim));
    } catch (e) {
      return [];
    }
  },

  async resolveClaim(warrantyId: string, claimId: string, resolutionStatus: 'APPROVED' | 'DENIED' | 'RESOLVED'): Promise<void> {
    try {
      await updateDoc(doc(db, `${WARRANTY_COLLECTION}/${warrantyId}/${CLAIM_COLLECTION}`, claimId), {
        status: resolutionStatus,
        updatedAt: Date.now()
      });
      await this.updateWarranty(warrantyId, { status: resolutionStatus === 'DENIED' ? 'ACTIVE' : 'CLAIM_RESOLVED' });
    } catch (e) {}
  }
};
