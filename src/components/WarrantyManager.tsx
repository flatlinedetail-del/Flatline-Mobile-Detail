import React, { useState, useEffect } from 'react';
import { Warranty, WarrantyClaim } from '../types/warranty';
import { warrantyService } from '../services/warrantyService';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface WarrantyManagerProps {
  clientId: string;
  vehicles: any[];
}

export default function WarrantyManager({ clientId, vehicles }: WarrantyManagerProps) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);

  useEffect(() => {
    loadWarranties();
  }, [clientId]);

  const loadWarranties = async () => {
    setLoading(true);
    try {
      const data = await warrantyService.getWarrantiesForClient(clientId);
      setWarranties(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMaintenance = async (w: Warranty) => {
    try {
      await warrantyService.logMaintenance(w.id!, w);
      toast.success('Maintenance logged & warranty updated.');
      loadWarranties();
    } catch (e) {
      toast.error('Failed to log maintenance.');
    }
  };

  const handleFileClaim = async (w: Warranty) => {
    const desc = prompt("Enter claim description or issue:");
    if (!desc) return;
    try {
      await warrantyService.createClaim(w.id!, {
        clientId: w.clientId,
        vehicleId: w.vehicleId,
        claimDate: Date.now(),
        issueDescription: desc,
        photos: [],
        inspectionNotes: "",
        status: 'OPEN'
      });
      toast.success("Claim opened successfully.");
      loadWarranties();
    } catch (e) {
      toast.error('Failed to open claim.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'EXPIRING_SOON': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'EXPIRED': return 'bg-neutral-500/10 text-neutral-500 border-neutral-500/20';
      case 'VOIDED': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'AT_RISK': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'CLAIM_OPEN': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'CLAIM_RESOLVED': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getVehicleName = (vid: string) => {
    const v = vehicles.find(v => v.id === vid);
    if (!v) return "Unknown Vehicle";
    return `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim() || v.vin || "Asset";
  };

  if (loading) {
    return <div className="p-8 text-center text-white/50">Loading warranties...</div>;
  }

  if (warranties.length === 0) {
    return (
      <div className="p-8 text-center border border-white/10 rounded-2xl bg-black/20">
        <h3 className="text-white font-bold mb-2">No Active Warranties</h3>
        <p className="text-white/50 text-sm">Warranties are automatically generated when jobs are completed with eligible services.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {warranties.map(w => (
        <Card key={w.id} className="bg-[#0B0B0B] border border-white/10 rounded-2xl overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 flex flex-row items-center justify-between p-6">
            <div>
              <CardTitle className="text-lg font-black text-white">{w.serviceName}</CardTitle>
              <p className="text-sm text-white/60 mt-1">{getVehicleName(w.vehicleId)}</p>
            </div>
            <Badge variant="outline" className={`font-black uppercase tracking-widest px-4 py-1.5 ${getStatusColor(w.status)}`}>
              {w.status.replace('_', ' ')}
            </Badge>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Coverage Type</p>
                <p className="text-sm font-medium text-white">{w.warrantyType} ({w.warrantyLengthMonths} Months)</p>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Start Date</p>
                  <p className="text-sm font-bold text-white">{format(w.startDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Expiration</p>
                  <p className="text-sm font-bold text-primary">{format(w.expirationDate, 'MMM d, yyyy')}</p>
                </div>
              </div>
              {w.maintenanceRequired && (
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0] mb-2">Maintenance Tracking</p>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs text-white/70">Next Due:</span>
                    <span className={`text-xs font-bold ${w.missedMaintenance || (w.nextMaintenanceDate && Date.now() > w.nextMaintenanceDate) ? 'text-red-400' : 'text-emerald-400'}`}>
                      {w.nextMaintenanceDate ? format(w.nextMaintenanceDate, 'MMM d, yyyy') : 'Pending'}
                    </span>
                  </div>
                  <Button 
                    onClick={() => handleMaintenance(w)}
                    size="sm"
                    className="w-full bg-white/10 hover:bg-white/20 text-white text-xs h-8"
                  >
                    Log Completed Maintenance
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Overview & Details</p>
                <p className="text-sm text-white/70 line-clamp-3">{w.coverageDetails || 'No specific coverage details provided.'}</p>
              </div>
              <div className="flex gap-3 mt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-white/10 hover:bg-white/5 h-10 text-xs"
                  onClick={() => setSelectedWarranty(w.id === selectedWarranty?.id ? null : w)}
                >
                  {w.id === selectedWarranty?.id ? "Close Details" : "View Full Details"}
                </Button>
                {w.status !== 'EXPIRED' && w.status !== 'VOIDED' && (
                  <Button 
                    variant="outline" 
                    className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-10 text-xs"
                    onClick={() => handleFileClaim(w)}
                  >
                    File Claim
                  </Button>
                )}
              </div>
            </div>
            
            {selectedWarranty?.id === w.id && (
               <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
                 <h4 className="text-sm font-bold text-white mb-2">Claim History & Information</h4>
                 <p className="text-xs text-white/60">If coverage limits apply or claims have been filed, they will appear here once the active database resolves the request.</p>
                 {w.status === 'CLAIM_OPEN' && (
                    <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                      <p className="text-xs font-bold text-purple-400">An active claim is open for this warranty.</p>
                      <Button onClick={() => {
                        warrantyService.resolveClaim(w.id!, "TEMP_CLAIM_ID", "RESOLVED").then(() => {
                           toast.success("Claim pseudo-resolved");
                           loadWarranties();
                        });
                      }} size="sm" className="mt-2 bg-purple-500 hover:bg-purple-600">Resolve (Demo)</Button>
                    </div>
                 )}
               </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
