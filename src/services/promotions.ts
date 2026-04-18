import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Coupon, Customer } from "../types";

/**
 * Loyalty Points System
 */
export async function addLoyaltyPoints(clientId: string, amount: number) {
  try {
    // 1. Get Loyalty Settings
    const settingsSnap = await getDoc(doc(db, "settings", "business"));
    const settings = settingsSnap.exists() ? settingsSnap.data() : null;
    const loyalty = settings?.loyaltySettings;

    if (!loyalty) {
      // Fallback to default if settings don't exist
      const points = Math.floor(amount);
      await updatePoints(clientId, points);
      return;
    }

    // 2. Calculate points
    let points = 0;
    if (loyalty.pointsPerDollar > 0) {
      points += Math.floor(amount * loyalty.pointsPerDollar);
    }
    if (loyalty.pointsPerVisit > 0) {
      points += loyalty.pointsPerVisit;
    }

    if (points > 0) {
      await updatePoints(clientId, points);
    }
  } catch (error) {
    console.error("Error adding loyalty points:", error);
  }
}

async function updatePoints(clientId: string, points: number) {
  // Try clients first, fallback to customers for legacy
  let clientRef = doc(db, "clients", clientId);
  let clientSnap = await getDoc(clientRef);
  
  if (!clientSnap.exists()) {
    clientRef = doc(db, "customers", clientId);
    clientSnap = await getDoc(clientRef);
  }

  if (clientSnap.exists()) {
    await updateDoc(clientRef, {
      loyaltyPoints: increment(points)
    });
  }
}

export async function redeemLoyaltyPoints(clientId: string, points: number) {
  const settingsSnap = await getDoc(doc(db, "settings", "business"));
  const settings = settingsSnap.exists() ? settingsSnap.data() : null;
  const loyalty = settings?.loyaltySettings;

  const redemptionRate = loyalty?.redemptionRate || 0.1; // Default $0.1 per point
  const minPoints = loyalty?.minPointsToRedeem || 0;

  if (points < minPoints) {
    throw new Error(`Minimum ${minPoints} points required to redeem`);
  }

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
  
  return points * redemptionRate; // $ discount
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
