import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Invoice } from "../types";
import { createDocMetadata, updateDocMetadata } from "../lib/firestoreUtils";
import { updateJobFields } from "./jobService";

const INVOICES_COL = "invoices";

export const getInvoiceById = async (invoiceId: string): Promise<Invoice | null> => {
  const invRef = doc(db, INVOICES_COL, invoiceId);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return null;
  const data = snap.data() as Invoice;
  return data.isDeleted ? null : { id: snap.id, ...data } as Invoice;
};

export const getInvoicesByBusiness = async (businessId: string): Promise<Invoice[]> => {
  const q = query(collection(db, INVOICES_COL), where("businessId", "==", businessId), where("isDeleted", "!=", true));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getInvoicesByClient = async (clientId: string, businessId: string): Promise<Invoice[]> => {
  const q = query(collection(db, INVOICES_COL), where("clientId", "==", clientId), where("businessId", "==", businessId), where("isDeleted", "!=", true));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getInvoicesByJob = async (jobId: string, businessId: string): Promise<Invoice[]> => {
  const q = query(collection(db, INVOICES_COL), where("jobId", "==", jobId), where("businessId", "==", businessId), where("isDeleted", "!=", true));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getInvoicesByAppointment = async (appointmentId: string, businessId: string): Promise<Invoice[]> => {
  const q = query(collection(db, INVOICES_COL), where("appointmentId", "==", appointmentId), where("businessId", "==", businessId), where("isDeleted", "!=", true));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const getUnpaidInvoices = async (businessId: string): Promise<Invoice[]> => {
  const q = query(
    collection(db, INVOICES_COL),
    where("businessId", "==", businessId),
    where("isDeleted", "!=", true),
    where("paymentStatus", "in", ["unpaid", "partial"])
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
};

export const createInvoice = async (invoiceData: Partial<Invoice>, businessId: string): Promise<string> => {
  const invRef = doc(collection(db, INVOICES_COL));
  const metadata = createDocMetadata(businessId);
  await setDoc(invRef, { ...invoiceData, ...metadata, isDeleted: false });
  return invRef.id;
};

const syncInvoiceToJob = async (invoice: Invoice, businessId: string) => {
  if (invoice.jobId) {
    let jobPaymentStatus = "pending";
    if (invoice.status === "paid" || invoice.paymentStatus === "paid") {
      jobPaymentStatus = "paid";
    } else if (invoice.status === "voided" || invoice.paymentStatus === "voided") {
      jobPaymentStatus = "voided";
    } else {
      jobPaymentStatus = "unpaid";
    }
    await updateJobFields(invoice.jobId, { paymentStatus: jobPaymentStatus as any }, businessId);
  }
};

export const updateInvoice = async (invoiceId: string, invoiceData: Partial<Invoice>, businessId: string) => {
  const invRef = doc(db, INVOICES_COL, invoiceId);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const currentInvoice = { id: snap.id, ...snap.data() } as Invoice;
  
  const metadata = updateDocMetadata();
  await updateDoc(invRef, { ...invoiceData, ...metadata });
  
  await syncInvoiceToJob({ ...currentInvoice, ...invoiceData }, businessId);
};

export const updateInvoiceFields = async (invoiceId: string, updates: Partial<Invoice>, businessId: string) => {
  const invRef = doc(db, INVOICES_COL, invoiceId);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const currentInvoice = { id: snap.id, ...snap.data() } as Invoice;

  const metadata = updateDocMetadata();
  await updateDoc(invRef, { ...updates, ...metadata });

  await syncInvoiceToJob({ ...currentInvoice, ...updates }, businessId);
};

export const softDeleteInvoice = async (invoiceId: string, businessId: string) => {
  const invRef = doc(db, INVOICES_COL, invoiceId);
  const metadata = updateDocMetadata();
  await updateDoc(invRef, { isDeleted: true, ...metadata });
};
