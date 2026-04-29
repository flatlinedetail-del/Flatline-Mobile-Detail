import { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  getDocs,
  deleteDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Shield, Plus, Trash2, Edit2 } from "lucide-react";
import { cn } from "../lib/utils";
import { ProtectedClient, Client } from "../types";
import { format } from "date-fns";

export default function ProtectedClients() {
  const [protectedClients, setProtectedClients] = useState<ProtectedClient[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ProtectedClient | null>(null);

  const [formData, setFormData] = useState({
    linkedClientId: "",
    fullName: "",
    phone: "",
    email: "",
    address: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    licensePlate: "",
    riskReason: "",
    internalNotes: "",
    riskLevel: "low" as "low" | "med" | "high",
    isActive: true
  });

  const { profile } = useAuth();
  
  useEffect(() => {
    if (!profile?.businessId) return;

    const unsub = onSnapshot(query(
      collection(db, "protected_clients"), 
      where("businessId", "==", profile.businessId),
      orderBy("createdAt", "desc")
    ), (snap) => {
      setProtectedClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProtectedClient)));
    }, (error) => {
      console.error("Protected Clients Subscription Error:", error);
    });
    
    const fetchClients = async () => {
      const snap = await getDocs(query(collection(db, "clients"), where("businessId", "==", profile.businessId)));
      setAllClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    };
    fetchClients();
    return unsub;
  }, [profile?.businessId]);

  useEffect(() => {
    if(editingClient) {
      setFormData({
        linkedClientId: editingClient.linkedClientId || "",
        fullName: editingClient.fullName,
        phone: editingClient.phone,
        email: editingClient.email,
        address: editingClient.address,
        vehicleYear: editingClient.vehicleYear || "",
        vehicleMake: editingClient.vehicleMake || "",
        vehicleModel: editingClient.vehicleModel || "",
        vin: editingClient.vin || "",
        licensePlate: editingClient.licensePlate || "",
        riskReason: editingClient.riskReason,
        internalNotes: editingClient.internalNotes || "",
        riskLevel: (editingClient as any).riskLevel || "low",
        isActive: editingClient.isActive
      });
    } else {
       setFormData({
        linkedClientId: "",
        fullName: "",
        phone: "",
        email: "",
        address: "",
        vehicleYear: "",
        vehicleMake: "",
        vehicleModel: "",
        vin: "",
        licensePlate: "",
        riskReason: "",
        internalNotes: "",
        riskLevel: "low",
        isActive: true
      });
    }
  }, [editingClient, isDialogOpen]);

  const autofillClient = (client: Client) => {
    setFormData(prev => ({
      ...prev,
      linkedClientId: client.id,
      fullName: client.name,
      phone: client.phone,
      email: client.email,
      address: client.address,
      riskLevel: client.riskLevel || "low"
    }));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = { ...formData, updatedAt: serverTimestamp(), businessId: profile?.businessId };
    try {
      let savedId;
      if (editingClient) {
        await updateDoc(doc(db, "protected_clients", editingClient.id), data);
        savedId = editingClient.id;
        toast.success("Protected client updated");
      } else {
        const docRef = await addDoc(collection(db, "protected_clients"), { ...data, createdAt: serverTimestamp() });
        savedId = docRef.id;
        toast.success("Protected client added");
      }

      // SYNC to Clients Registry
      if (formData.linkedClientId) {
         try {
           await updateDoc(doc(db, "clients", formData.linkedClientId), { riskLevel: formData.riskLevel });
         } catch(e) { console.error("Failed syncing link to client", e); }
      } else {
        // Find match
        const matchingClient = allClients.find(c => 
           (c.email && formData.email && c.email.toLowerCase() === formData.email.toLowerCase()) ||
           (c.phone && formData.phone && c.phone === formData.phone) ||
           (c.name && formData.fullName && c.name.toLowerCase() === formData.fullName.toLowerCase())
        );
        if (matchingClient) {
          try {
            await updateDoc(doc(db, "clients", matchingClient.id), { riskLevel: formData.riskLevel });
            await updateDoc(doc(db, "protected_clients", savedId), { linkedClientId: matchingClient.id });
          } catch(e) { console.error("Failed matching client link", e); }
        }
      }

      setIsDialogOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save protected client");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure?")) {
      await deleteDoc(doc(db, "protected_clients", id));
      toast.success("Client removed");
    }
  };

  const filtered = useMemo(() => {
    return protectedClients.filter(c => 
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [protectedClients, searchTerm]);

  return (
    <div className="space-y-6 pb-24 w-full">
      <PageHeader 
        title="Risk Management"
        accentWord="Management"
        subtitle="Flag clients for special handling during the booking process."
        actions={
          <Button className="bg-primary hover:bg-red-700 text-white font-black h-12 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px]" onClick={() => { setEditingClient(null); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Protected Client
          </Button>
        }
      />
      <Card className="border-none bg-card rounded-3xl overflow-hidden shadow-xl">
        <div className="p-8 border-b border-white/5 bg-black/40">
           <Input placeholder="Search..." className="bg-white/5 border-white/10 text-white font-bold rounded-2xl h-14" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest px-8">Client</TableHead>
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">Protection</TableHead>
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">Status</TableHead>
              <TableHead className="text-right px-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(client => (
              <TableRow key={client.id} className="border-white/5 hover:bg-white/5">
                <TableCell className="px-8 py-4">
                  <p className="font-bold text-white">{client.fullName}</p>
                </TableCell>
                <TableCell><Badge className={cn("text-[10px] font-black uppercase tracking-widest", (client as any).riskLevel === 'high' ? "bg-red-500/20 text-red-500" : (client as any).riskLevel === 'med' ? "bg-yellow-500/20 text-yellow-500" : "bg-green-500/20 text-green-500")}>{(client as any).riskLevel === 'high' ? 'High Risk' : (client as any).riskLevel === 'med' ? 'Medium Risk' : 'Low Risk'}</Badge></TableCell>
                <TableCell><Switch checked={client.isActive} disabled /></TableCell>
                <TableCell className="text-right px-8">
                  <Button variant="ghost" size="icon" onClick={() => { setEditingClient(client); setIsDialogOpen(true); }}><Edit2 className="w-4 h-4 text-white/40" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl sm:max-w-[700px]">
          <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
            <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase flex items-center gap-2">
              <Shield className="w-6 h-6 text-orange-500" />
              {editingClient ? "Edit Rule" : "New Rule"}
            </DialogTitle>
          </DialogHeader>
           <DialogBody>
             <form onSubmit={handleSave} className="space-y-4">
             <div className="space-y-2">
               <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">Autofill from Client Registry</Label>
               <Select onValueChange={(val) => { const cl = allClients.find(c => c.id === val); if(cl) autofillClient(cl); }}>
                 <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                   <SelectValue placeholder="Search clients..." />
                 </SelectTrigger>
                 <SelectContent className="bg-gray-900 border-white/10 text-white">
                   {allClients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                 </SelectContent>
               </Select>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <Input name="fullName" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Full Name" required className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                <Input name="phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Phone" required className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
             </div>
             <Input name="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Email" className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
             <Textarea name="riskReason" value={formData.riskReason} onChange={e => setFormData({...formData, riskReason: e.target.value})} placeholder="Risk Reason" required className="bg-white/5 border-white/10 text-white rounded-xl" />
             <Select value={formData.riskLevel} onValueChange={(val: any) => setFormData({...formData, riskLevel: val})}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                   <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-white/10 text-white">
                   <SelectItem value="low">Low Risk</SelectItem>
                   <SelectItem value="med">Medium Risk</SelectItem>
                   <SelectItem value="high">High Risk</SelectItem>
                </SelectContent>
             </Select>
             <div className="flex items-center gap-4">
                <Switch name="isActive" checked={formData.isActive} onCheckedChange={(val) => setFormData({...formData, isActive: val})} />
                <Label className="text-white">Active Protection</Label>
             </div>
             <Button type="submit" className="w-full bg-primary h-14 rounded-xl font-black uppercase tracking-[0.2em]">Save Rule</Button>
          </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
