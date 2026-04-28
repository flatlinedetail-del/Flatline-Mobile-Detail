import { useState, useEffect } from "react";
import { subscribeToWaitlistCount } from "../services/appointmentService";

export function useWaitlistCount(businessId: string) {
  const [activeWaitlistCount, setActiveWaitlistCount] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    const unsubscribe = subscribeToWaitlistCount(businessId, (count) => {
      setActiveWaitlistCount(count);
    });
    return () => unsubscribe();
  }, [businessId]);

  return activeWaitlistCount;
}
