import { openDB, IDBPDatabase } from 'idb';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  Timestamp,
  setDoc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { SyncStatus } from '../types';

const DB_NAME = 'DurableOfflineSync';
const DB_VERSION = 1;
const SYNC_STORE = 'sync_queue';

export interface SyncTask {
  localId: string;
  collection: string;
  data: any;
  operation: 'create' | 'update' | 'delete';
  syncStatus: SyncStatus;
  createdAt: number;
  lastSyncAttempt?: number;
  retryCount: number;
  error?: string;
  targetId?: string; // For updates/deletes, the Firestore document ID
}

class SyncService {
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          const store = db.createObjectStore(SYNC_STORE, { keyPath: 'localId' });
          store.createIndex('syncStatus', 'syncStatus');
          store.createIndex('collection', 'collection');
        }
      },
    });

    // Listen for online events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 App back online, triggering sync...');
        this.syncPendingRecords();
      });
      
      // Auto-trigger sync on load if online
      if (navigator.onLine) {
        this.syncPendingRecords();
      }
    }
  }

  /**
   * Check if there are any pending tasks for a specific collection or all
   */
  async hasPendingTasks(collectionName?: string): Promise<boolean> {
    const tasks = await this.getTasksByStatus('pending');
    if (!collectionName) return tasks.length > 0;
    return tasks.some(t => t.collection === collectionName);
  }

  /**
   * Save a record to the offline queue
   */
  async enqueueTask(
    collectionName: string, 
    data: any, 
    operation: 'create' | 'update' | 'delete' = 'create',
    targetId?: string
  ): Promise<string> {
    const localId = crypto.randomUUID();
    const task: SyncTask = {
      localId,
      collection: collectionName,
      data,
      operation,
      syncStatus: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      targetId
    };

    const db = await this.dbPromise;
    await db.put(SYNC_STORE, task);
    
    // Non-blocking trigger of sync
    this.syncPendingRecords();
    
    return localId;
  }

  /**
   * Retrieve all pending or failed tasks
   */
  async getTasksByStatus(status: SyncStatus | 'all' = 'pending'): Promise<SyncTask[]> {
    const db = await this.dbPromise;
    if (status === 'all') {
      return db.getAll(SYNC_STORE);
    }
    return db.getAllFromIndex(SYNC_STORE, 'syncStatus', status);
  }

  /**
   * Main sync logic
   */
  async syncPendingRecords() {
    if (!navigator.onLine) return;

    const tasks = await this.getTasksByStatus('pending');
    const failedTasks = await this.getTasksByStatus('failed');
    const allTasksToSync = [...tasks, ...failedTasks];

    if (allTasksToSync.length === 0) return;

    console.log(`🔄 Syncing ${allTasksToSync.length} pending records...`);

    for (const task of allTasksToSync) {
      const result = await this.processTask(task);
      // If we hit a critical stop error like quota, stop the entire sync loop
      if (result === 'stop') {
        console.warn("⏹️ Quota limit hit, stopping sync batch.");
        break;
      }
    }
  }

  private async processTask(task: SyncTask): Promise<'continue' | 'stop'> {
    try {
      // Update metadata before attempt
      task.lastSyncAttempt = Date.now();
      task.retryCount++;

      let remoteId = task.targetId;

      const dataToSync = {
        ...task.data,
        createdAt: task.data.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        localId: task.localId,
        syncStatus: 'synced',
        lastSyncAttempt: Timestamp.now(),
      };

      if (task.operation === 'create') {
        const docRef = await addDoc(collection(db, task.collection), dataToSync);
        remoteId = docRef.id;
      } else if (task.operation === 'update' && task.targetId) {
        await updateDoc(doc(db, task.collection, task.targetId), dataToSync);
      } else if (task.operation === 'delete' && task.targetId) {
        await deleteDoc(doc(db, task.collection, task.targetId));
      }

      // Mark as synced and optionally remove or update in IDB
      // The requirement says "mark successful records as synced"
      // We'll keep them but update status
      task.syncStatus = 'synced';
      task.error = undefined;
      
      const dbInstance = await this.dbPromise;
      await dbInstance.put(SYNC_STORE, task);
      
      console.log(`✅ Synced ${task.collection} record ${task.localId} -> ${remoteId}`);
      return 'continue';
    } catch (error: any) {
      console.error(`❌ Sync failed for task ${task.localId}:`, error);
      task.syncStatus = 'failed';
      task.error = error.message || String(error);
      
      const dbInstance = await this.dbPromise;
      await dbInstance.put(SYNC_STORE, task);

      const msg = error.message?.toLowerCase() || "";
      const code = error.code?.toLowerCase() || "";
      if (code === 'resource-exhausted' || msg.includes("quota") || msg.includes("resource exhausted")) {
        return 'stop';
      }
      return 'continue';
    }
  }

  /**
   * Helper to merge local pending data with Firestore results
   */
  async injectPendingRecords<T extends any>(collectionName: string, items: T[]): Promise<T[]> {
    const pending = await this.getTasksByStatus('pending');
    const failed = await this.getTasksByStatus('failed');
    
    const localTasks = [...pending, ...failed].filter(t => t.collection === collectionName);
    
    // Separate creates, updates, and deletes
    const createTasks = localTasks.filter(t => t.operation === 'create');
    const updateTasks = localTasks.filter(t => t.operation === 'update');
    const deleteTasks = localTasks.filter(t => t.operation === 'delete');

    // Apply updates to existing items in the list
    let updatedItems = items.map(item => {
      const updateTask = updateTasks.find(ut => ut.targetId === (item as any).id || (ut.localId === (item as any).localId));
      if (updateTask) {
        return {
          ...(item as any),
          ...(updateTask.data as any),
          syncStatus: updateTask.syncStatus,
          syncError: updateTask.error,
          localId: updateTask.localId // To indicate it has a pending local task
        } as T;
      }
      return item;
    });

    // Remove deleted items from the list
    updatedItems = updatedItems.filter(item => {
      const isDeleted = deleteTasks.some(dt => dt.targetId === (item as any).id || (dt.localId === (item as any).localId));
      return !isDeleted;
    });

    // Prepare create items
    const localCreateItems = createTasks.map(t => ({
      ...(t.data as any),
      id: t.localId, // Use localId while pending
      localId: t.localId,
      syncStatus: t.syncStatus,
      syncError: t.error,
    } as T));

    // Combine and remove duplicates (if Firestore doc and localId match)
    const syncedLocalIds = new Set(updatedItems.map((i: any) => i.localId).filter(Boolean));
    const unsyncedLocals = localCreateItems.filter((li: any) => !syncedLocalIds.has(li.localId));
    
    return [...unsyncedLocals, ...updatedItems];
  }
}

export const syncService = new SyncService();
