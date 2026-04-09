import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Coupon, Customer } from "../types";

/**
 * Loyalty Points System
 * 1 point per $1 spent
 * 100 points = $10 discount
 */
export async function addLoyaltyPoints(clientId: string, amount: number) {
  // Try clients first, fallback to customers for legacy
  let clientRef = doc(db, "clients", clientId);
  let clientSnap = await getDoc(clientRef);
  
  if (!clientSnap.exists()) {
    clientRef = doc(db, "customers", clientId);
    clientSnap = await getDoc(clientRef);
  }

  if (clientSnap.exists()) {
    await updateDoc(clientRef, {
      loyaltyPoints: increment(Math.floor(amount))
    });
  }
}

export async function redeemLoyaltyPoints(clientId: string, points: number) {
  let clientRef = doc(db, "clients", clientId);
  let clientSnap = await getDoc(clientRef);
  
  if (!clientSnap.exists()) {
    clientRef = doc(db, "customers", clientId);
    clientSnap = await getDoc(clientRef);
  }

  if (!clientSnap.exists()) throw new Error("Client not found");
  
  const currentPoints = clientSnap.data().loyaltyPoints || 0;
  if (currentPoints < points) throw new Error("Insufficient loyalty points");

  await updateDoc(clientRef, {
    loyaltyPoints: increment(-points)
  });
  
  return points / 10; // $ discount
}

/**
 * Coupon System
 */
export async function validateCoupon(code: string, purchaseAmount: number): Promise<Coupon | null> {
  const q = query(
    collection(db, "coupons"),
    where("code", "==", code.toUpperCase()),
    where("isActive", "==", true)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const coupon = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Coupon;
  
  // Check expiry
  if (coupon.expiryDate && coupon.expiryDate.toDate() < new Date()) return null;
  
  // Check usage limit
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) return null;
  
  return coupon;
}

export function calculateDiscount(coupon: Coupon, amount: number): number {
  if (coupon.discountType === "percentage") {
    return (amount * coupon.discountValue) / 100;
  }
  return coupon.discountValue;
}
