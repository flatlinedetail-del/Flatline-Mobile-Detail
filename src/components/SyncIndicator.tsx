import React, { useState, useEffect } from 'react';
import { syncService } from '../services/syncService';
import { RefreshCw, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      const pending = await syncService.getTasksByStatus('pending');
      const failed = await syncService.getTasksByStatus('failed');
      setPendingCount(pending.length);
      setFailedCount(failed.length);
    };

    const interval = setInterval(checkStatus, 3000); // Check every 3s
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    await syncService.syncPendingRecords();
    setIsSyncing(false);
  };

  if (!isOnline && pendingCount === 0 && failedCount === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-500 text-[10px] font-black uppercase tracking-widest">
        <WifiOff className="w-3 h-3" />
        Offline Mode
      </div>
    );
  }

  if (pendingCount === 0 && failedCount === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-500 text-[10px] font-black uppercase tracking-widest">
        <CheckCircle2 className="w-3 h-3" />
        All Synced
      </div>
    );
  }

  return (
    <div 
      onClick={triggerSync}
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-xl cursor-pointer transition-all",
        failedCount > 0 ? "bg-red-500/20 border border-red-500/30 text-red-400" : "bg-primary/20 border border-primary/30 text-primary"
      )}
    >
      <div className="flex items-center gap-2">
        {isSyncing ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : failedCount > 0 ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        <span className="text-[10px] font-black uppercase tracking-widest">
          {isSyncing ? 'Syncing...' : (failedCount > 0 ? `${failedCount} Failed` : `${pendingCount} Pending`)}
        </span>
      </div>
      
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-1 text-[8px] bg-red-500 text-white px-2 py-0.5 rounded-full uppercase"
          >
            <WifiOff className="w-2 h-2" />
            Offline
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
