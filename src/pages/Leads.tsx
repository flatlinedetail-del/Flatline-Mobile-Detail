import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, Timestamp, deleteDoc, limit, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { cn, formatPhoneNumber, cleanAddress } from "../lib/utils";
import { StandardInput } from "../components/StandardInput";
import { 
  UserPlus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  History,
  ExternalLink,
  Trash2,
  Settings2,
  DatabaseZap,
  RefreshCcw
} from "lucide-react";
import { toast } from "sonner";
import { syncService } from "../services/syncService";
import { format, addDays } from "date-fns";
import { Lead } from "../types";
import { useNavigate } from "react-router-dom";
import AddressInput from "../components/AddressInput";
import { createNotification } from "../services/notificationService";
import VehicleSelector from "../components/VehicleSelector";
import VehicleSizeSelect from "../components/VehicleSizeSelect";
import { isVehicleSize } from "../lib/vehicleSize";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";

export default function Leads() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [newVehicleData, setNewVehicleData] = useState({ year: "", make: "", model: "" });
  const [newLeadAddress, setNewLeadAddress] = useState({ 
    address: "", 
    lat: 0, 
    lng: 0,
    city: "",
    state: "",
    zipCode: "",
    placeId: ""
  });

  const fetchLeads = async (showToast = false) => {
    // Check cache first if not performing a manual sync
    if (!showToast) {
      const cached = sessionStorage.getItem('leads_cache');
      const cacheTime = sessionStorage.getItem('leads_cache_time');
      const now = Date.now();
      
      if (cached && cacheTime && now - Number(cacheTime) < 5 * 60 * 1000) { // 5 min cache
        setLeads(JSON.parse(cached));
        setLoading(false);
        return;
      }
    }

    if (showToast) toast.loading("Scanning Pipeline...", { id: "sync-leads" });
    try {
      const q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      let leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      
      // Merge pending offline leads
      leadsData = await syncService.injectPendingRecords("leads", leadsData);
      
      setLeads(leadsData);
      
      // Update cache
      sessionStorage.setItem('leads_cache', JSON.stringify(leadsData));
      sessionStorage.setItem('leads_cache_time', Date.now().toString());
      
      setLoading(false);
      if (showToast) toast.success("Pipeline Synchronized", { id: "sync-leads" });
    } catch (error: any) {
      console.error("Error fetching leads:", error);
      setLoading(false);
      if (error.message?.includes('quota')) {
        toast.error("Firestore quota exceeded.");
      }
      if (showToast) toast.error("Sync Failed", { id: "sync-leads" });
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchLeads();
  }, [profile, authLoading]);

  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const vehicleSize = formData.get("size");
    const leadData: any = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: newLeadAddress.address,
      latitude: newLeadAddress.lat,
      longitude: newLeadAddress.lng,
      city: newLeadAddress.city,
      state: newLeadAddress.state,
      zipCode: newLeadAddress.zipCode,
      placeId: newLeadAddress.placeId,
      vehicleInfo: `${newVehicleData.year} ${newVehicleData.make} ${newVehicleData.model}`.trim(),
      vehicleSize: isVehicleSize(vehicleSize) ? vehicleSize : "medium",
      requestedService: formData.get("requestedService"),
      source: formData.get("source") || "Direct",
      status: editingLead?.status || "new",
      priority: formData.get("priority") || "medium",
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingLead) {
        try {
          await updateDoc(doc(db, "leads", editingLead.id), leadData);
          toast.success("Lead updated successfully");
        } catch (err) {
          console.warn("Direct update failed, enqueuing...", err);
          await syncService.enqueueTask("leads", leadData, 'update', editingLead.id);
          toast.info("Offline: Update saved locally and will sync later");
        }
      } else {
        try {
          const docRef = await addDoc(collection(db, "leads"), {
            ...leadData,
            createdAt: serverTimestamp(),
            createdBy: profile?.uid,
            nextFollowUpAt: Timestamp.fromDate(addDays(new Date(), 1)),
          });

          // Trigger Notification
          await createNotification({
            userId: profile!.id,
            title: "New Opportunity Detected",
            message: `New lead ${leadData.name} initialized via ${leadData.source}`,
            type: "client",
            relatedId: docRef.id,
            relatedType: "lead"
          });

          toast.success("Lead added successfully");
        } catch (err) {
          console.warn("Direct add failed, enqueuing...", err);
          await syncService.enqueueTask("leads", {
            ...leadData,
            createdAt: Date.now()
          }, 'create');
          toast.info("Offline: Lead saved locally and will sync later");
        }
      }
      
      // Invalidate cache
      sessionStorage.removeItem('leads_cache');
      sessionStorage.removeItem('leads_cache_time');
      
      setIsAddDialogOpen(false);
      setEditingLead(null);
      fetchLeads();
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    }
  };

  const updateLeadStatus = async (leadId: string, status: Lead["status"]) => {
    try {
      const updateData: any = { 
        status,
        updatedAt: serverTimestamp(),
        lastFollowUp: serverTimestamp()
      };

      if (status === "contacted") {
        updateData.contactedAt = serverTimestamp();
      } else if (status === "quoted") {
        updateData.quotedAt = serverTimestamp();
      } else if (status === "converted") {
        updateData.convertedAt = serverTimestamp();
      }

      await updateDoc(doc(db, "leads", leadId), updateData);

      // Trigger Notification
      await createNotification({
        userId: profile!.id,
        title: "Lead Status Progress",
        message: `Opportunity ${selectedLead?.name || "Lead"} progressed to ${status}`,
        type: "client",
        relatedId: leadId,
        relatedType: "lead"
      });

      toast.success(`Status updated to ${status}`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteLead = async (id: string) => {
    console.log("Attempting to delete lead:", id);
    if (!id) {
      toast.error("Invalid lead ID");
      return;
    }

    try {
      await deleteDoc(doc(db, "leads", id));
      toast.success("Lead deleted successfully");
      setIsDetailOpen(false);
    } catch (error) {
      console.error("Error deleting lead:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `leads/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete lead: ${err.message}`);
      }
    }
  };

  const filteredLeads = leads.filter(lead => 
    (lead.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (lead.phone || "").includes(searchTerm) ||
    (lead.vehicleInfo?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    new: "bg-white/10 text-white border-white/10",
    contacted: "bg-primary/10 text-primary border-primary/20",
    quoted: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    converted: "bg-green-500/10 text-green-500 border-green-500/20",
    lost: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <div className="space-y-8 pb-20 max-w-[1600px] mx-auto">
      <PageHeader 
        title="Lead PIPELINE" 
        accentWord="PIPELINE" 
        subtitle={`Conversion Engine: Active • ${leads.length} Opportunities`}
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-[10px] h-12 px-6"
              onClick={() => navigate("/leads/engine")}
            >
              <DatabaseZap className="w-4 h-4 mr-2" />
              AI Lead Engine
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setEditingLead(null);
              setNewLeadAddress({ 
                address: "", 
                lat: 0, 
                lng: 0,
                city: "",
                state: "",
                zipCode: "",
                placeId: ""
              });
            }
          }}>
            <DialogTrigger render={
              <Button className="bg-primary hover:opacity-90 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105" onClick={() => {
                setEditingLead(null);
                setIsAddDialogOpen(true);
              }}>
                <UserPlus className="w-4 h-4 mr-2" />
                Initialize Lead
              </Button>
            } />
          <DialogContent className="bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black sm:max-w-[700px]">
            <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase header-glow">{editingLead ? "Modify Opportunity" : "New Opportunity Acquisition"}</DialogTitle>
                  <p className="text-[10px] text-white font-black uppercase tracking-[0.2em] mt-1">Strategic Lead Intake Protocol</p>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleAddLead} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Target Full Name</Label>
                    <StandardInput 
                      id="name" 
                      name="name" 
                      value={editingLead?.name || ""} 
                      placeholder="John Doe" 
                      required 
                      onValueChange={() => {}} // Internal state handles it, or I should make it more robust
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold" 
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Contact Frequency (Phone)</Label>
                    <StandardInput 
                      id="phone" 
                      name="phone" 
                      variant="phone"
                      value={editingLead?.phone || ""}
                      placeholder="(555) 000-0000" 
                      required 
                      onValueChange={() => {}}
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Digital Identity (Email)</Label>
                  <StandardInput 
                    id="email" 
                    name="email" 
                    variant="email"
                    value={editingLead?.email || ""} 
                    placeholder="john@example.com" 
                    onValueChange={() => {}}
                    className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold" 
                  />
                </div>
                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Mission Coordinates (Address)</Label>
                  <AddressInput 
                    defaultValue={editingLead?.address || ""}
                    onAddressSelect={(address, lat, lng, structured) => setNewLeadAddress({ 
                      address, 
                      lat, 
                      lng,
                      city: structured?.city || "",
                      state: structured?.state || "",
                      zipCode: structured?.zipCode || "",
                      placeId: structured?.placeId || ""
                    })}
                    placeholder="123 Main St, City, ST"
                    className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Asset Profile (Vehicle)</Label>
                  <VehicleSelector 
                    onSelect={setNewVehicleData}
                    initialValues={editingLead?.vehicleInfo ? {
                      year: editingLead.vehicleInfo.split(" ")[0] || "",
                      make: editingLead.vehicleInfo.split(" ")[1] || "",
                      model: editingLead.vehicleInfo.split(" ").slice(2).join(" ") || ""
                    } : undefined}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="font-black uppercase tracking-widest text-[10px] text-white">Vehicle Size</Label>
                  <VehicleSizeSelect
                    vehicle={newVehicleData.year ? newVehicleData : { vehicleInfo: editingLead?.vehicleInfo || "" }}
                    defaultValue={editingLead?.vehicleSize || "medium"}
                    autoDetectFromDefault={!editingLead?.vehicleSize}
                    triggerClassName="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold"
                    contentClassName="bg-zinc-900 border-white/10 text-white"
                    labels={{
                      small: "Small (Coupe/Compact)",
                      medium: "Medium (Sedan/Small SUV)",
                      large: "Large (Full SUV/Truck)",
                      extra_large: "Extra Large (Van/Lifted)",
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Requested Protocol (Service)</Label>
                    <StandardInput 
                      id="requestedService" 
                      name="requestedService" 
                      value={editingLead?.requestedService || ""} 
                      placeholder="Full Detail" 
                      onValueChange={() => {}}
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold" 
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Priority Designation</Label>
                    <Select name="priority" defaultValue={editingLead?.priority || "medium"}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                        <SelectItem value="hot" className="font-bold text-primary focus:bg-white/5">HOT (READY TO BOOK)</SelectItem>
                        <SelectItem value="high" className="font-bold focus:bg-white/5">HIGH</SelectItem>
                        <SelectItem value="medium" className="font-bold focus:bg-white/5">MEDIUM</SelectItem>
                        <SelectItem value="low" className="font-bold focus:bg-white/5">LOW</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Acquisition Source</Label>
                    <StandardInput 
                      id="source" 
                      name="source" 
                      value={editingLead?.source || ""} 
                      placeholder="Google, FB, Referral" 
                      onValueChange={() => {}}
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold" 
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsAddDialogOpen(false)}
                  className="flex-1 text-white hover:text-white font-black uppercase tracking-widest text-[10px] h-14"
                >
                  Abort
                </Button>
                <Button type="submit" className="flex-[2] bg-primary text-white hover:opacity-90 font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105">
                  {editingLead ? "Authorize Update" : "Authorize Acquisition"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    }
  />

      <Card className="border border-white/5 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-xl">
        <CardHeader className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-black/40">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input 
              placeholder="Search opportunities..." 
              className="pl-12 bg-white/5 border border-white/10 text-white rounded-xl h-12 font-medium focus:ring-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 px-6"
              onClick={() => fetchLeads(true)}
            >
              <RefreshCcw className="w-4 h-4 mr-2 text-primary" />
              Sync Pipeline
            </Button>
            <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
              <Filter className="w-4 h-4 mr-2 text-primary" />
              Filter Pipeline
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Customer Entity</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Asset & Service</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Status</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Next Engagement</TableHead>
                <TableHead className="px-8 py-5 text-right text-[10px] font-black text-white uppercase tracking-[0.2em]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent border-none">
                  <TableCell colSpan={5} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px] animate-pulse">Scanning Pipeline...</TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow className="hover:bg-transparent border-none">
                  <TableCell colSpan={5} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px]">No opportunities detected.</TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="hover:bg-white/5 transition-all duration-300 cursor-pointer group border-b border-white/5"
                    onClick={() => {
                      setSelectedLead(lead);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="font-black text-white uppercase tracking-tight text-sm">{lead.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-white font-bold uppercase tracking-widest mt-1">
                          <Phone className="w-3 h-3 text-primary" />
                          {formatPhoneNumber(lead.phone)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{lead.vehicleInfo}</span>
                        <span className="text-[10px] text-white font-black uppercase tracking-widest mt-0.5">{lead.requestedService}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <Badge variant="outline" className={cn(
                        "text-[9px] uppercase font-black tracking-widest px-2.5 py-1 rounded-md border-none",
                        lead.status === "new" ? "bg-white/10 text-white" :
                        lead.status === "contacted" ? "bg-primary/10 text-primary" :
                        lead.status === "converted" ? "bg-green-500/10 text-green-400" :
                        "bg-white/10 text-white"
                      )}>
                        {lead.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-8 py-6">
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest",
                          lead.nextFollowUpAt && lead.nextFollowUpAt.toDate() < new Date() ? "text-primary" : "text-white"
                        )}>
                          {lead.nextFollowUpAt ? format(lead.nextFollowUpAt.toDate(), "MMM d, yyyy") : "TBD"}
                        </span>
                        {lead.priority === "hot" && (
                          <Badge className="bg-primary text-white text-[8px] font-black uppercase tracking-widest w-fit mt-1.5 px-2 py-0.5">HOT</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white hover:text-white hover:bg-white/10 rounded-xl transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLead(lead);
                            setNewLeadAddress({
                              address: lead.address || "",
                              lat: lead.latitude || 0,
                              lng: lead.longitude || 0,
                              city: lead.city || "",
                              state: lead.state || "",
                              zipCode: lead.zipCode || "",
                              placeId: lead.placeId || ""
                            });
                            setIsAddDialogOpen(true);
                          }}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white hover:text-white hover:bg-white/10 rounded-xl transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `tel:${lead.phone}`;
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white hover:text-green-400 hover:bg-green-500/10 rounded-xl transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                          navigate(`/book-appointment?leadId=${lead.id}`);
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-white hover:text-red-500 hover:bg-red-500/20 bg-white/5 rounded-xl transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Purge Opportunity?"
                          itemName={lead.name}
                          onConfirm={() => handleDeleteLead(lead.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lead Details Dialog */}
      {selectedLead && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="bg-[#0B0B0B] border border-white/10 p-0 overflow-hidden rounded-3xl shadow-2xl sm:max-w-[600px]">
            <div className="bg-primary p-8 text-white shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <Badge className="bg-white/20 text-white border-none mb-3 uppercase font-black tracking-widest text-[10px] px-3 py-1">
                    {selectedLead.status} OPPORTUNITY
                  </Badge>
                  <h2 className="text-4xl font-black tracking-tighter uppercase font-heading">{selectedLead.name}</h2>
                  <div className="flex items-center gap-4 mt-3">
                    <p className="text-white flex items-center gap-2 text-sm font-bold">
                      <Phone className="w-4 h-4" /> {formatPhoneNumber(selectedLead.phone)}
                    </p>
                    <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                    <p className="text-white flex items-center gap-2 text-sm font-bold">
                      <Mail className="w-4 h-4" /> {selectedLead.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mb-1">Priority</p>
                  <p className="text-2xl font-black capitalize tracking-tighter">{selectedLead.priority}</p>
                </div>
              </div>
            </div>

            <div key={selectedLead.id} className="p-8 space-y-8 bg-[#0B0B0B]">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">Target Asset</p>
                  <p className="text-lg font-black text-white uppercase tracking-tight">{selectedLead.vehicleInfo}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">Requested Protocol</p>
                  <p className="text-lg font-black text-white uppercase tracking-tight">{selectedLead.requestedService}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Intelligence Notes</p>
                <Textarea 
                  defaultValue={selectedLead.notes}
                  placeholder="Add details about the inquiry..."
                  className="min-h-[120px] bg-white/5 border-white/10 text-white rounded-2xl focus-visible:ring-primary p-5 leading-relaxed"
                  onBlur={async (e) => {
                    await updateDoc(doc(db, "leads", selectedLead.id), { notes: e.target.value });
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button 
                  className="bg-primary hover:opacity-90 text-white font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-[1.02]"
                  onClick={() => {
                    setIsDetailOpen(false);
                    
                    document.body.style.pointerEvents = "";
                    document.body.style.overflow = "";
                    document.body.removeAttribute("data-scroll-locked");
                    
                    setTimeout(() => {
                      navigate(`/book-appointment?leadId=${selectedLead.id}`);
                    }, 350);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Convert to Job
                </Button>
                <Button 
                  variant="outline" 
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10 font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all hover:scale-[1.02]"
                  onClick={() => updateLeadStatus(selectedLead.id, "contacted")}
                >
                  <MessageSquare className="w-4 h-4 mr-2 text-primary" /> Mark Contacted
                </Button>
                <Button 
                  variant="outline" 
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-red-500/20 font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all hover:scale-[1.02]"
                  onClick={() => updateLeadStatus(selectedLead.id, "lost")}
                >
                  <XCircle className="w-4 h-4 mr-2 text-primary" /> Mark Lost
                </Button>
                <DeleteConfirmationDialog
                  trigger={
                    <Button 
                      variant="ghost" 
                      className="bg-red-500/10 border-none text-red-500 hover:text-white hover:bg-red-500 font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all w-full md:w-auto"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Purge Opportunity
                    </Button>
                  }
                  title="Purge Opportunity?"
                  itemName={selectedLead.name}
                  onConfirm={() => handleDeleteLead(selectedLead.id)}
                />
              </div>

              <div className="pt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-white font-black uppercase tracking-widest">
                <p>Captured: {format(selectedLead.createdAt.toDate(), "MMM d, yyyy h:mm a")}</p>
                <p>Source: {selectedLead.source}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
