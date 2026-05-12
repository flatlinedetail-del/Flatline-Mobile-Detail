import {
  collection, query, getDocs, addDoc, updateDoc, doc, deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { WaiverRule } from "../types/waiver";

const COL = "waiver_rules";

export async function loadWaiverRules(): Promise<WaiverRule[]> {
  const snap = await getDocs(query(collection(db, COL)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WaiverRule));
}

export async function createWaiverRule(
  rule: Omit<WaiverRule, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...rule,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWaiverRule(
  id: string,
  patch: Partial<Omit<WaiverRule, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWaiverRule(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function toggleWaiverRule(id: string, status: "active" | "inactive"): Promise<void> {
  await updateWaiverRule(id, { status });
}
