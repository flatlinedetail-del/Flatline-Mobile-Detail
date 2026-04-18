import { auth, db } from "../firebase";
import { GoogleAuthProvider, signInWithPopup, linkWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
}

export const linkGoogleCalendar = async () => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/calendar");
  
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    
    if (token) {
      // Store token in Firestore or local state
      // Note: In a real app, we'd store a refresh token securely on a backend.
      // For this client-side demo, we store the access token in Firestore (or just use it while valid).
      await setDoc(doc(db, "users", auth.currentUser.uid, "integrations", "googleCalendar"), {
        accessToken: token,
        linkedAt: new Date(),
        email: result.user.email
      }, { merge: true });
      
      return token;
    }
    throw new Error("No access token received");
  } catch (error) {
    console.error("Error linking Google Calendar:", error);
    throw error;
  }
};

export const unlinkGoogleCalendar = async () => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  const docRef = doc(db, "users", auth.currentUser.uid, "integrations", "googleCalendar");
  await deleteDoc(docRef);
  return true;
};

export const getGoogleCalendarToken = async () => {
  if (!auth.currentUser) return null;
  const docRef = doc(db, "users", auth.currentUser.uid, "integrations", "googleCalendar");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data().accessToken;
  }
  return null;
};

export const fetchGoogleEvents = async (timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> => {
  const token = await getGoogleCalendarToken();
  if (!token) return [];

  try {
    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/primary/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired
        throw new Error("Google Calendar token expired. Please reconnect.");
      }
      throw new Error("Failed to fetch Google Calendar events");
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Error fetching Google events:", error);
    throw error;
  }
};

export const createGoogleEvent = async (event: any) => {
  const token = await getGoogleCalendarToken();
  if (!token) return null;

  try {
    const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) throw new Error("Failed to create Google Calendar event");
    return await response.json();
  } catch (error) {
    console.error("Error creating Google event:", error);
    throw error;
  }
};

export const updateGoogleEvent = async (eventId: string, event: any) => {
  const token = await getGoogleCalendarToken();
  if (!token) return null;

  try {
    const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) throw new Error("Failed to update Google Calendar event");
    return await response.json();
  } catch (error) {
    console.error("Error updating Google event:", error);
    throw error;
  }
};

export const deleteGoogleEvent = async (eventId: string) => {
  const token = await getGoogleCalendarToken();
  if (!token) return null;

  try {
    const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to delete Google Calendar event");
    return true;
  } catch (error) {
    console.error("Error deleting Google event:", error);
    throw error;
  }
};
