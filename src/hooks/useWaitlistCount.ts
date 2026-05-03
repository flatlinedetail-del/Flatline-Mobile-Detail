import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function useWaitlistCount() {
  const [activeWaitlistCount, setActiveWaitlistCount] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("status", "in", ["waitlisted", "pending_waitlist", "offered"]),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveWaitlistCount(snapshot.size);
    });
    return () => unsubscribe();
  }, []);

  return activeWaitlistCount;
}
