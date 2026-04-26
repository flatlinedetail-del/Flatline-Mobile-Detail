import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Service } from "../types";

export interface BundleOffer {
  id?: string;
  clientId: string;
  vehicleId?: string | null;
  vehicleName?: string;
  bundleName: string;
  includedServices: { serviceId: string; serviceName: string; }[];
  originalPrice: number;
  dealPrice: number;
  savings: number;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: any;
  updatedAt: any;
}

export async function fetchClientBundles(clientId: string): Promise<BundleOffer[]> {
  const q = query(collection(db, "bundle_offers"), where("clientId", "==", clientId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BundleOffer)).sort((a,b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });
}

export async function saveBundleOffer(offer: Omit<BundleOffer, "id" | "createdAt" | "updatedAt">): Promise<BundleOffer> {
  const docRef = await addDoc(collection(db, "bundle_offers"), {
    ...offer,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { ...offer, id: docRef.id, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
}

export async function updateBundleStatus(bundleId: string, status: BundleOffer["status"]): Promise<void> {
  await updateDoc(doc(db, "bundle_offers", bundleId), {
    status,
    updatedAt: serverTimestamp()
  });
}
