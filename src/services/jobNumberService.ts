import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const COUNTER_DOC = doc(db, "counters", "jobNumbers");
const PREFIX = "DF";
const SEED = 1000; // first allocated number will be DF-1001

/**
 * Atomically allocates the next job number via a Firestore transaction.
 * Two concurrent callers will each receive a unique number because the
 * transaction serialises the read-modify-write on the counter document.
 *
 * Gaps in the sequence are acceptable: if the appointment write fails
 * after the counter increments, that number is simply skipped.
 */
export async function allocateJobNumber(): Promise<string> {
  const n = await runTransaction(db, async (t) => {
    const snap = await t.get(COUNTER_DOC);
    const current: number = snap.exists() ? (snap.data().current as number) : SEED;
    const next = current + 1;
    t.set(COUNTER_DOC, { current: next });
    return next;
  });
  return `${PREFIX}-${n}`;
}

/**
 * Allocates `count` consecutive numbers in a single transaction and
 * returns the first integer in the range. Callers produce the labels:
 *   DF-<start>, DF-<start+1>, … DF-<start+count-1>
 * Used for recurring appointment series so the entire batch costs one
 * round-trip instead of N.
 */
export async function allocateJobNumberRange(count: number): Promise<number> {
  if (count <= 0) return 0;
  return runTransaction(db, async (t) => {
    const snap = await t.get(COUNTER_DOC);
    const current: number = snap.exists() ? (snap.data().current as number) : SEED;
    t.set(COUNTER_DOC, { current: current + count });
    return current + 1;
  });
}

/**
 * Ensures an existing appointment has a jobNumber.
 * If it already has one, returns it immediately (no write).
 * Otherwise allocates the next number, writes it back to Firestore,
 * and returns the new value.
 */
export async function ensureJobNumber(
  appointmentId: string,
  existingJobNumber: string | undefined,
): Promise<string> {
  if (existingJobNumber) return existingJobNumber;
  const num = await allocateJobNumber();
  await updateDoc(doc(db, "appointments", appointmentId), { jobNumber: num });
  return num;
}
