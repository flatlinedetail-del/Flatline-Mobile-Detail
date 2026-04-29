import { 
  serverTimestamp, 
  query, 
  where, 
  QueryConstraint,
  DocumentData,
  Query,
  collection,
  doc,
  writeBatch,
  DocumentReference,
  Firestore
} from "firebase/firestore";
import { auth, db } from "../firebase";

export const getAuthUser = () => {
    const user = auth.currentUser;
    if (!user) {
        return { uid: 'public_user' };
    }
    return user;
};

// Base interface for all Firestore documents
export interface FirestoreModel {
    id: string;
    businessId: string;
    createdAt: any;
    updatedAt: any;
    createdBy: string;
    updatedBy: string;
    isDeleted: boolean;
}

export const createDocMetadata = (businessId: string) => {
    const user = getAuthUser();
    const now = serverTimestamp();
    return {
        businessId,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        isDeleted: false
    };
};

export const updateDocMetadata = () => {
    const user = getAuthUser();
    return {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
    };
};

export const getBaseQuery = (businessId: string): QueryConstraint[] => {
    return [
        where("businessId", "==", businessId),
        where("isDeleted", "==", false)
    ];
};
