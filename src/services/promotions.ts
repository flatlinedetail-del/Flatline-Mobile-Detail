import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Coupon, Customer } from "../types";

/**
 * Loyalty Points System
 * 1 point per $1 spent
 * 100 points = $10 discount
 */
export async function addLoyaltyPoints(customerId: string, amount: number) {
  const customerRef = doc(db, "customers", customerId);
  await updateDoc(customerRef, {
    loyaltyPoints: increment(Math.floor(amount))
  });
}

export async function redeemLoyaltyPoints(customerId: string, points: number) {
  const customerRef = doc(db, "customers", customerId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) throw new Error("Customer not found");
  
  const currentPoints = customerSnap.data().loyaltyPoints || 0;
  if (currentPoints < points) throw new Error("Insufficient loyalty points");

  await updateDoc(customerRef, {
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
  if (coupon.expiryDate.toDate() < new Date()) return null;
  
  // Check min purchase
  if (coupon.minPurchase && purchaseAmount < coupon.minPurchase) return null;
  
  return coupon;
}

export function calculateDiscount(coupon: Coupon, amount: number): number {
  if (coupon.type === "percentage") {
    return (amount * coupon.value) / 100;
  }
  return coupon.value;
}
