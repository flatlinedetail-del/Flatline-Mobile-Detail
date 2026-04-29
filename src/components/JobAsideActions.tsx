import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Mail, MessageSquare, FileText, DollarSign, Undo, Ban, Trash2, 
  RefreshCcw, PlayCircle, Navigation, LayoutDashboard, Clock, 
  History, CreditCard, Receipt, Loader2, Sparkles, Send, 
  AlertTriangle, Truck, Share2, ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

export interface JobAsideActionsProps {
  job: any;
  businessSettings: any;
  isUpdating: boolean;
  communicationLogs: any[];
  toggleSmsAutomation: () => void;
  messagingService: any;
  id: string;
  handleWaitlistAction: (action: string) => void;
  formatCurrency: (amount: number) => string;
  handleAcceptRecommendation: (rec: any) => void;
  isInvoiceModalOpen: boolean;
  setIsInvoiceModalOpen: (open: boolean) => void;
  currentInvoice: any;
  handleDownloadPDF: (invoice: any) => void;
  handleAcceptPayment: (invoice: any) => void;
  handleUndoPayment: (invoice: any) => void;
  handleVoidPayment: (invoice: any) => void;
  handleDeleteInvoice: (invoice: any) => void;
  handleMarkPaid: () => void;
  handleGenerateInvoice: () => void;
  handleResynchronizeJob: () => void;
  handleStatusChange: (status: string) => void;
  isLoadingProtocol: boolean;
  canProtocolUpdate: boolean;
  isAwaitingPayment: boolean;
  paymentDetails: any;
  allServices: any[];
  allAddons: any[];
  showAddServiceDialog: boolean;
  setShowAddServiceDialog: (show: boolean) => void;
  handleQuickAddService: (item: any) => void;
  handleRefund: () => void;
  totalPaid: number;
  totalRemaining: number;
}

export const JobAsideActions: React.FC<JobAsideActionsProps> = ({
  job,
  businessSettings,
  isUpdating,
  communicationLogs,
  toggleSmsAutomation,
  messagingService,
  id,
  handleWaitlistAction,
  formatCurrency,
  handleAcceptRecommendation,
  setIsInvoiceModalOpen,
  currentInvoice,
  handleDownloadPDF,
  handleAcceptPayment,
  handleUndoPayment,
  handleVoidPayment,
  handleDeleteInvoice,
  handleMarkPaid,
  handleGenerateInvoice,
  handleResynchronizeJob,
  handleStatusChange,
  isLoadingProtocol,
  canProtocolUpdate,
  isAwaitingPayment,
  paymentDetails,
  allServices,
  allAddons,
  showAddServiceDialog,
  setShowAddServiceDialog,
  handleQuickAddService,
  handleRefund,
  totalPaid,
  totalRemaining
}) => {
  return (
    <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-32 h-fit pb-20">
      {job.status === "waitlisted" && (
        <Card className="border-none shadow-xl bg-orange-500/10 border border-orange-500/20 rounded-3xl overflow-hidden">
          <CardHeader className="bg-orange-500/10 border-b border-orange-500/10 p-6 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Waitlisted Booking</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
               <p className="text-xs text-white/70"><strong>Original:</strong> {job.scheduledAt ? job.scheduledAt.toDate().toLocaleString() : "--"}</p>
               {job.waitlistInfo?.backupScheduledAt && (
                 <p className="text-xs text-white/70"><strong>Backup:</strong> {job.waitlistInfo.backupScheduledAt.toDate().toLocaleString()}</p>
               )}
               {job.waitlistInfo?.flexibleSameDay && (
                 <p className="text-xs text-emerald-400 font-bold">Client is flexible on date</p>
               )}
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-orange-500/10">
               <Button onClick={() => handleWaitlistAction("offerOriginal")} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 w-full" disabled={isUpdating}>
                 Offer Original Time
               </Button>
               {job.waitlistInfo?.backupScheduledAt && (
                 <Button onClick={() => handleWaitlistAction("approveBackup")} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 w-full" disabled={isUpdating}>
                   Approve Backup Time
                 </Button>
               )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client Communication */}
      {job.status !== "requested" && job.status !== "canceled" && (
        <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
          <CardHeader className="bg-black/20 border-b border-white/5 p-6 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Client Communication</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Pause</span>
              <Switch 
                checked={job.smsAutomationPaused || false}
                onCheckedChange={toggleSmsAutomation}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {communicationLogs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Recent Messages</span>
                    <Badge className="bg-white/10 text-white hover:bg-white/20 border-none px-2">{communicationLogs.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {communicationLogs.slice(0, 3).map(log => (
                      <div key={log.id} className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold text-white capitalize">{log.type.replace(/_/g, " ")}</span>
                          <Badge variant="outline" className={cn(
                            "text-[8px] font-black uppercase tracking-wider",
                            log.status === "sent" ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" : 
                            log.status === "failed" ? "text-red-500 border-red-500/20 bg-red-500/10" : "text-blue-500 border-blue-500/20 bg-blue-500/10"
                          )}>
                            {log.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-white/60 truncate">{log.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <span className="text-[10px] uppercase font-black text-white/40 tracking-widest pl-1">Scheduled Reminders</span>
                {[
                  { key: "confirmation", label: "Booking Confirmation" },
                  { key: "twentyFourHour", label: "24-Hour Reminder" },
                  { key: "twoHour", label: "2-Hour Reminder" }
                ].map(({ key, label }) => {
                  const status = job.reminders?.[key];
                  const isSent = status === 'sent';
                  const isFailed = status === 'failed';
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                      <span className="text-[11px] font-bold text-white/80">{label}</span>
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5",
                        isSent ? "bg-emerald-500/10 text-emerald-500" :
                        isFailed ? "bg-red-500/10 text-red-500" : "bg-white/5 text-white/30"
                      )}>
                        {status || 'Scheduled'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Status & Protocol */}
      <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
        <CardHeader className="bg-black/20 border-b border-white/5 p-6 flex flex-row items-center justify-between">
          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Deployment Protocol</CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleResynchronizeJob}
            disabled={isUpdating}
            className="h-8 w-8 text-white/40 hover:text-primary rounded-full"
          >
            <RefreshCcw className={cn("w-3.5 h-3.5", isUpdating && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 pl-1">Active Status</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'scheduled', label: 'Scheduled', icon: Clock },
                  { value: 'in_progress', label: 'Start Deploy', icon: PlayCircle },
                  { value: 'completed', label: 'Finalize', icon: ShieldCheck },
                  { value: 'canceled', label: 'Cancel', icon: Ban }
                ].map((s) => (
                  <Button
                    key={s.value}
                    variant={job.status === s.value ? "default" : "outline"}
                    onClick={() => handleStatusChange(s.value)}
                    disabled={isUpdating || (s.value === 'completed' && job.status !== 'in_progress')}
                    className={cn(
                      "h-14 flex flex-col items-center justify-center gap-1.5 rounded-2xl transition-all font-black uppercase tracking-widest text-[9px]",
                      job.status === s.value 
                        ? "bg-primary text-white shadow-lg shadow-primary/20 border-none" 
                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <s.icon className="w-3.5 h-3.5" />
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Settlement */}
      <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden border-t-4 border-t-primary">
        <CardHeader className="bg-black/20 border-b border-white/5 p-6">
          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Financial Settlement</CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-8">
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Settlement Total</span>
              <div className="text-right">
                <span className="text-4xl font-black text-white block leading-none">{formatCurrency(job.totalAmount || 0)}</span>
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-2 block">Authorized Amount</span>
              </div>
            </div>

            {totalPaid > 0 && (
              <div className="flex justify-between items-center p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Collected Funds</span>
                <span className="text-lg font-black text-emerald-500">{formatCurrency(totalPaid)}</span>
              </div>
            )}

            {totalRemaining > 0 && (
              <div className="flex justify-between items-center p-4 bg-primary/10 border border-primary/20 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Balance Due</span>
                <span className="text-lg font-black text-white">{formatCurrency(totalRemaining)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 pt-4 border-t border-white/5">
             <Button 
                onClick={handleGenerateInvoice}
                disabled={isUpdating}
                className="h-16 bg-white hover:bg-gray-100 text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-xl transition-all active:scale-95"
              >
                < Receipt className="w-4 h-4 mr-3 text-primary" />
                Generate Strategic Invoice
              </Button>

              <Button 
                onClick={handleMarkPaid}
                disabled={isUpdating || job.paymentStatus === 'paid'}
                className="h-16 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
              >
                <DollarSign className="w-4 h-4 mr-3" />
                Settle Balance (Cash/Other)
              </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
