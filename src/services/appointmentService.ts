import { 
  collection, 
  query, 
  getDocs, 
  getDoc,
  doc, 
  setDoc,
  updateDoc,
  writeBatch,
  where,
  orderBy,
  Timestamp,
  limit,
  onSnapshot,
  WriteBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { Appointment } from "../types";
import { createDocMetadata, updateDocMetadata, getBaseQuery } from "../lib/firestoreUtils";
import { handleMissedAppointment } from "./automationService";

const APPOINTMENTS_COL = "appointments";

export const subscribeToWaitlistCount = (
  businessId: string,
  callback: (count: number) => void
) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("status", "in", ["waitlisted", "pending_waitlist", "offered"]),
    where("isDeleted", "!=", true)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.size);
  });
};

export const subscribeToAppointmentsForClientRecommendations = (
  businessId: string,
  clientId: string,
  callback: (appointments: Appointment[]) => void
) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true)
  );
  return onSnapshot(q, (snap) => {
    const apps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
    callback(apps);
  });
};

export const getAppointments = async (businessId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    orderBy("scheduledAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getAppointmentsInRange = async (businessId: string, start: Date, end: Date): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("scheduledAt", ">=", Timestamp.fromDate(start)),
    where("scheduledAt", "<=", Timestamp.fromDate(end)),
    orderBy("scheduledAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getUpcomingJobs = async (businessId: string, limitCount: number = 5): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("scheduledAt", ">=", Timestamp.fromDate(new Date())),
    orderBy("scheduledAt", "asc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getAppointmentsForMonth = async (businessId: string, startOfMonth: Date, endOfMonth: Date): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("scheduledAt", ">=", Timestamp.fromDate(startOfMonth)),
    where("scheduledAt", "<=", Timestamp.fromDate(endOfMonth)),
    limit(300)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getAppointmentsBySeriesId = async (businessId: string, seriesId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("recurringInfo.seriesId", "==", seriesId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getAppointmentById = async (appointmentId: string): Promise<Appointment | null> => {
  const apptRef = doc(db, APPOINTMENTS_COL, appointmentId);
  const snap = await getDoc(apptRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Appointment;
};

export const getClientAppointments = async (businessId: string, clientId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getClientAppointmentsRecent = async (businessId: string, clientId: string, limitCount: number = 50): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true),
    orderBy("scheduledAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const updateClientAppointmentsName = async (businessId: string, clientId: string, newDisplayName: string) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  const metadata = updateDocMetadata();
  snap.docs.forEach(appDoc => {
    batch.update(appDoc.ref, { customerName: newDisplayName, ...metadata });
  });
  await batch.commit();
};

export const softDeleteClientAppointmentsBatch = async (businessId: string, clientId: string) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
     where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  const metadata = updateDocMetadata();
  snap.docs.forEach(d => {
    batch.update(d.ref, { isDeleted: true, ...metadata });
  });
  await batch.commit();
};

export const getFutureAppointments = async (businessId: string): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("scheduledAt", ">=", Timestamp.fromDate(new Date()))
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const getRecentAppointments = async (businessId: string, limitCount: number = 100): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const createAppointmentsBatch = async (appointmentDataList: Partial<Appointment>[], businessId: string): Promise<string[]> => {
  const batch = writeBatch(db);
  const ids: string[] = [];
  
  appointmentDataList.forEach(data => {
    const apptRef = doc(collection(db, APPOINTMENTS_COL));
    const metadata = createDocMetadata(businessId);
    batch.set(apptRef, { ...data, ...metadata });
    ids.push(apptRef.id);
  });
  await batch.commit();
  return ids;
};

export const createAppointment = async (appointmentData: Partial<Appointment>, businessId: string): Promise<string> => {
  const apptRef = doc(collection(db, APPOINTMENTS_COL));
  const metadata = createDocMetadata(businessId);
  await setDoc(apptRef, { ...appointmentData, ...metadata });
  return apptRef.id;
};

export const updateAppointment = async (appointmentId: string, appointmentData: Partial<Appointment>, businessId: string) => {
  const apptRef = doc(db, APPOINTMENTS_COL, appointmentId);
  const metadata = updateDocMetadata();
  
  if (appointmentData.status === 'canceled') {
    await handleMissedAppointment(appointmentId, businessId);
  }
  
  await updateDoc(apptRef, { ...appointmentData, ...metadata });
};

export const softDeleteAppointment = async (appointmentId: string, businessId: string) => {
  const apptRef = doc(db, APPOINTMENTS_COL, appointmentId);
  const metadata = updateDocMetadata();
  await updateDoc(apptRef, { isDeleted: true, ...metadata });
};
export const updateAppointmentsBatch = async (appointmentIds: string[], updateData: Partial<Appointment>, businessId: string) => {
  const batch = writeBatch(db);
  const metadata = updateDocMetadata();
  appointmentIds.forEach(id => {
    const apptRef = doc(db, APPOINTMENTS_COL, id);
    batch.update(apptRef, { ...updateData, ...metadata });
  });
  await batch.commit();
};

export const softDeleteAppointmentsBatch = async (appointmentIds: string[], businessId: string) => {
  const batch = writeBatch(db);
  const metadata = updateDocMetadata();
  appointmentIds.forEach(id => {
    const apptRef = doc(db, APPOINTMENTS_COL, id);
    batch.update(apptRef, { isDeleted: true, ...metadata });
  });
  await batch.commit();
};

export const batchDeleteClientAppointments = async (batch: WriteBatch, businessId: string, clientId: string) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  const metadata = updateDocMetadata();
  snap.docs.forEach(d => {
    batch.update(d.ref, { isDeleted: true, ...metadata });
  });
};

export const batchUpdateClientAppointmentsName = async (batch: WriteBatch, businessId: string, clientId: string, newDisplayName: string) => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("clientId", "==", clientId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  const metadata = updateDocMetadata();
  snap.docs.forEach(appDoc => {
    batch.update(appDoc.ref, { customerName: newDisplayName, ...metadata });
  });
};

export const hasVehicleAppointments = async (businessId: string, vehicleId: string): Promise<boolean> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("vehicleId", "==", vehicleId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

export const hasCustomerAppointments = async (businessId: string, customerId: string): Promise<boolean> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("customerId", "==", customerId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

export const hasVendorAppointments = async (businessId: string, vendorId: string): Promise<boolean> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("vendorId", "==", vendorId),
    where("isDeleted", "!=", true)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

export const getVendorAppointmentsRecent = async (businessId: string, vendorId: string, limitCount: number = 50): Promise<Appointment[]> => {
  const q = query(
    collection(db, APPOINTMENTS_COL),
    ...getBaseQuery(businessId),
    where("vendorId", "==", vendorId),
    where("isDeleted", "!=", true),
    orderBy("scheduledAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};
