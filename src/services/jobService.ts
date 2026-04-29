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
  WriteBatch,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { Job, Appointment } from "../types";
import { createDocMetadata, updateDocMetadata, getBaseQuery } from "../lib/firestoreUtils";
import { updateAppointment } from "./appointmentService";
import { triggerPostJobFollowUp } from "./automationService";

const JOBS_COL = "jobs";

export const getJobById = async (jobId: string): Promise<Job | null> => {
  const jobRef = doc(db, JOBS_COL, jobId);
  const snap = await getDoc(jobRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Job;
};

export const onJobSnapshot = (jobId: string, businessId: string, callback: (job: Job | null) => void) => {
  return onSnapshot(doc(db, JOBS_COL, jobId), (snap) => {
    if (snap.exists()) {
      const data = snap.data() as Job;
      if (data.isDeleted) {
        callback(null);
      } else {
        callback({ id: snap.id, ...data } as Job);
      }
    } else {
      callback(null);
    }
  }, (error) => {
    console.error(`Job Subscription Error for ID ${jobId}:`, error);
  });
};

export const createJob = async (jobData: Partial<Job>, businessId: string): Promise<string> => {
  const jobRef = doc(collection(db, JOBS_COL));
  const { totalAmount, totalRevenue, totalProductCost, estimatedProfit } = calculateJobProfitability(jobData as Job);
  const metadata = createDocMetadata(businessId);
  await setDoc(jobRef, { ...jobData, totalAmount, totalRevenue, totalProductCost, estimatedProfit, ...metadata });
  return jobRef.id;
};


export const softDeleteJob = async (jobId: string, businessId: string) => {
  const jobRef = doc(db, JOBS_COL, jobId);
  const metadata = updateDocMetadata();
  await updateDoc(jobRef, { isDeleted: true, ...metadata });
};

async function syncJobToAppointment(jobId: string, jobUpdates: Partial<Job>, businessId: string) {
  const job = await getJobById(jobId);
  if (job?.appointmentId) {
    const appointmentUpdates: Partial<Appointment> = {};
    if (jobUpdates.status) {
      appointmentUpdates.status = jobUpdates.status as any; // Simple mapping
    }
    if (Object.keys(appointmentUpdates).length > 0) {
      await updateAppointment(job.appointmentId, appointmentUpdates, businessId);
    }
  }
}

export const calculateJobProfitability = (job: Job) => {
  const serviceSelections = job.serviceSelections || [];
  const totalAmount = serviceSelections.reduce((sum, s) => sum + (s.total || (s.price * s.qty)), 0);
  const totalRevenue = totalAmount;
  const totalProductCost = serviceSelections.reduce((sum, s) => sum + ((s.productCost || 0) * (s.qty || 1)), 0);
  const estimatedProfit = totalRevenue - totalProductCost;
  return { totalAmount, totalRevenue, totalProductCost, estimatedProfit };
};

const _getFinalUpdates = (currentJob: Job, updates: Partial<Job>) => {
  const mergedJob = { ...currentJob, ...updates } as Job;
  const { totalAmount, totalRevenue, totalProductCost, estimatedProfit } = calculateJobProfitability(mergedJob);
  const metadata = updateDocMetadata();
  return { 
    ...updates, 
    totalAmount,
    totalRevenue, 
    totalProductCost, 
    estimatedProfit,
    ...metadata 
  };
};

export const updateJob = async (jobId: string, jobData: Partial<Job>, businessId: string) => {
  const jobRef = doc(db, JOBS_COL, jobId);
  const snap = await getDoc(jobRef);
  if (!snap.exists()) return;
  const currentJob = { id: snap.id, ...snap.data() } as Job;

  const finalUpdates = _getFinalUpdates(currentJob, jobData);
  await updateDoc(jobRef, finalUpdates);
};

export const updateJobFields = async (jobId: string, updates: Partial<Job>, businessId: string) => {
  const jobRef = doc(db, JOBS_COL, jobId);
  const snap = await getDoc(jobRef);
  if (!snap.exists()) return;
  const currentJob = { id: snap.id, ...snap.data() } as Job;

  const finalUpdates = _getFinalUpdates(currentJob, updates);
  await updateDoc(jobRef, finalUpdates);
  
  if (updates.status === 'completed' && currentJob.status !== 'completed' && !currentJob.postJobFollowUpSentAt) {
    await triggerPostJobFollowUp(currentJob.clientId, businessId);
    await updateDoc(jobRef, { postJobFollowUpSentAt: serverTimestamp() });
  }

  await syncJobToAppointment(jobId, updates, businessId);
};

export const addJobProductCost = async (jobId: string, costData: any, businessId: string) => {
  const jobRef = doc(db, JOBS_COL, jobId);
  const metadata = updateDocMetadata();
  // Simplified logic, assume costData allows updating array in a real app,
  // but here we just append to the productCosts array.
  await updateDoc(jobRef, { 
    productCosts: arrayUnion(costData),
    ...metadata 
  });
};

export const convertAppointmentToJob = async (appointment: Appointment, businessId: string): Promise<string> => {
  const jobData: Partial<Job> = {
    appointmentId: appointment.id,
    clientId: appointment.clientId,
    vehicleId: appointment.vehicleId,
    serviceIds: appointment.serviceIds,
    totalAmount: appointment.totalAmount,
    baseAmount: appointment.totalAmount,
    scheduledAt: appointment.scheduledAt,
    notes: appointment.customerNotes,
    status: "scheduled",
    paymentStatus: "unpaid",
    depositAmount: appointment.depositAmount,
    depositType: appointment.depositType,
  };

  const jobId = await createJob(jobData, businessId);

  await updateAppointment(appointment.id, {
    jobId: jobId
  }, businessId);

  return jobId;
}
