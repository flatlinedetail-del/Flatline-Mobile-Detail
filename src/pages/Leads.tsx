import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, Timestamp, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { cn, formatPhoneNumber } from "../lib/utils";
import { getGeocode, getLatLng } from "use-places-autocomplete";
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
  Settings2
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Lead } from "../types";
import { useNavigate } from "react-router-dom";
import AddressInput from "../components/AddressInput";

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
  const [newLeadAddress, setNewLeadAddress] = useState({ 
    address: "", 
    lat: 0, 
    lng: 0,
    city: "",
    state: "",
    zipCode: "",
    placeId: ""
  });

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(leadsData);
      setLoading(false);

      // Auto-geocode missing coordinates for visible leads
      leadsData.forEach(async (lead: any) => {
        if (lead.address && (!lead.latitude || !lead.longitude)) {
          try {
            const results = await getGeocode({ address: lead.address });
            if (results && results.length > 0) {
              const { lat, lng } = await getLatLng(results[0]);
              await updateDoc(doc(db, "leads", lead.id), {
                latitude: lat,
                longitude: lng
              });
            }
          } catch (error) {
            console.error("Auto-geocode error for lead:", lead.id, error);
          }
        }
      });
    }, (error) => {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    });

    return () => unsubscribe();
  }, [profile, authLoading]);

  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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
      vehicleInfo: formData.get("vehicleInfo"),
      requestedService: formData.get("requestedService"),
      source: formData.get("source") || "Direct",
      status: editingLead?.status || "new",
      priority: formData.get("priority") || "medium",
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingLead) {
        await updateDoc(doc(db, "leads", editingLead.id), leadData);
        toast.success("Lead updated successfully");
      } else {
        await addDoc(collection(db, "leads"), {
          ...leadData,
          createdAt: serverTimestamp(),
          createdBy: profile?.uid,
          nextFollowUpAt: Timestamp.fromDate(addDays(new Date(), 1)),
        });
        toast.success("Lead added successfully");
      }
      setIsAddDialogOpen(false);
      setEditingLead(null);
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    }
  };

  const updateLeadStatus = async (leadId: string, status: Lead["status"]) => {
    try {
      await updateDoc(doc(db, "leads", leadId), { 
        status,
        updatedAt: serverTimestamp(),
        lastFollowUp: serverTimestamp()
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
    new: "bg-gray-100 text-gray-700 border-gray-200",
    contacted: "bg-black text-white border-black",
    quoted: "bg-red-50 text-primary border-red-200",
    converted: "bg-green-100 text-green-700 border-green-200",
    lost: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">LEADS</h1>
          <p className="text-gray-500 font-medium">Manage your potential customers and inquiries.</p>
        </div>
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
            <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold" onClick={() => {
              setEditingLead(null);
              setIsAddDialogOpen(true);
            }}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add New Lead
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px] p-0">
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle className="text-xl font-black">{editingLead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddLead} className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" name="name" defaultValue={editingLead?.name || ""} placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    defaultValue={editingLead?.phone || ""}
                    placeholder="(555) 000-0000" 
                    required 
                    onChange={(e) => {
                      e.target.value = formatPhoneNumber(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" name="email" type="email" defaultValue={editingLead?.email || ""} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Service Address</Label>
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
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleInfo">Vehicle Info</Label>
                  <Input id="vehicleInfo" name="vehicleInfo" defaultValue={editingLead?.vehicleInfo || ""} placeholder="2022 Tesla Model 3" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestedService">Requested Service</Label>
                  <Input id="requestedService" name="requestedService" defaultValue={editingLead?.requestedService || ""} placeholder="Full Detail" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select name="priority" defaultValue={editingLead?.priority || "medium"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">Hot (Ready to book)</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" name="source" defaultValue={editingLead?.source || ""} placeholder="Google, FB, Referral" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-red-700 font-bold">
                {editingLead ? "Update Lead" : "Create Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search leads..." 
                className="pl-10 bg-white border-gray-200 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="border-gray-200">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="w-[250px]">Customer</TableHead>
                <TableHead>Vehicle & Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Follow-up</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">Loading leads...</TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">No leads found.</TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedLead(lead);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">{lead.name}</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Phone className="w-3 h-3" />
                          {formatPhoneNumber(lead.phone)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-700">{lead.vehicleInfo}</span>
                        <span className="text-xs text-gray-500">{lead.requestedService}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-black uppercase text-[10px] tracking-wider", statusColors[lead.status] || "bg-gray-100 text-gray-700")}>
                        {lead.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-xs font-bold",
                          lead.nextFollowUpAt && lead.nextFollowUpAt.toDate() < new Date() ? "text-red-600" : "text-gray-600"
                        )}>
                          {lead.nextFollowUpAt ? format(lead.nextFollowUpAt.toDate(), "MMM d, yyyy") : "No date"}
                        </span>
                        {lead.priority === "hot" && (
                          <Badge className="bg-red-600 text-white text-[9px] w-fit mt-1">HOT</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
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
                          className="h-8 w-8 text-gray-400 hover:text-primary"
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
                          className="h-8 w-8 text-gray-400 hover:text-green-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate("/appointments", { state: { lead } });
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Lead?"
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
          <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-primary p-6 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <Badge className="bg-white/20 text-white border-none mb-2 uppercase font-black tracking-widest">
                    {selectedLead.status} Lead
                  </Badge>
                  <h2 className="text-3xl font-black tracking-tighter">{selectedLead.name}</h2>
                  <p className="text-red-100 flex items-center gap-2 mt-1">
                    <Phone className="w-4 h-4" /> {formatPhoneNumber(selectedLead.phone)}
                    <span className="opacity-30">|</span>
                    <Mail className="w-4 h-4" /> {selectedLead.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-200 font-bold uppercase">Priority</p>
                  <p className="text-xl font-black capitalize">{selectedLead.priority}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vehicle</p>
                  <p className="text-lg font-bold text-gray-900">{selectedLead.vehicleInfo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Requested Service</p>
                  <p className="text-lg font-bold text-gray-900">{selectedLead.requestedService}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Notes</p>
                <Textarea 
                  defaultValue={selectedLead.notes}
                  placeholder="Add details about the inquiry..."
                  className="min-h-[100px] bg-gray-50 border-none focus-visible:ring-primary"
                  onBlur={async (e) => {
                    await updateDoc(doc(db, "leads", selectedLead.id), { notes: e.target.value });
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  className="flex-1 bg-primary hover:bg-red-700 font-bold"
                  onClick={() => navigate("/appointments", { state: { lead: selectedLead } })}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Convert to Job
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 border-gray-200 font-bold"
                  onClick={() => updateLeadStatus(selectedLead.id, "contacted")}
                >
                  <MessageSquare className="w-4 h-4 mr-2" /> Mark Contacted
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 border-gray-200 font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => updateLeadStatus(selectedLead.id, "lost")}
                >
                  <XCircle className="w-4 h-4 mr-2" /> Mark Lost
                </Button>
                <DeleteConfirmationDialog
                  trigger={
                    <Button 
                      variant="ghost" 
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Lead
                    </Button>
                  }
                  title="Delete Lead?"
                  itemName={selectedLead.name}
                  onConfirm={() => handleDeleteLead(selectedLead.id)}
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-medium">
                <p>Created: {format(selectedLead.createdAt.toDate(), "MMM d, yyyy h:mm a")}</p>
                <p>Source: {selectedLead.source}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
