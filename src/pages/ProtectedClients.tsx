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
  deleteDoc
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
import { Shield, Plus, Trash2, Edit2, User } from "lucide-react";
import { ProtectedClient, Client } from "../types";
import { format } from "date-fns";
import { cn } from "../lib/utils";

export default function ProtectedClients() {
  const [protectedClients, setProtectedClients] = useState<ProtectedClient[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ProtectedClient | null>(null);

  const [formData, setFormData] = useState({
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
    protectionLevel: "Low" as any,
    requiredDepositType: "fixed" as any,
    requiredDepositValue: 0,
    isActive: true,
    linkedClientId: ""
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const qRules = query(collection(db, "protected_clients"), orderBy("createdAt", "desc"));
        const snapRules = await getDocs(qRules);
        setProtectedClients(snapRules.docs.map(d => ({ id: d.id, ...d.data() } as ProtectedClient)));
        
        const snapClients = await getDocs(collection(db, "clients"));
        setAllClients(snapClients.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      } catch (error: any) {
        if (error.message?.includes("quota")) {
          toast.error("Database quota reached. Historical data may be unavailable.");
        }
      }
    };

    fetchData();
  }, []);

  const autofillClient = (client: any) => {
    const riskVal = client.riskLevel || client.risk_level || client.riskStatus || client.clientRiskLevel || client.riskManagement?.level;
    setFormData(prev => ({
      ...prev,
      fullName: client.name || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      linkedClientId: client.id,
      protectionLevel: (riskVal as any) || prev.protectionLevel,
      riskReason: client.riskReason || prev.riskReason || ""
    }));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = { ...formData, updatedAt: serverTimestamp() };
    try {
      if (editingClient) {
        await updateDoc(doc(db, "protected_clients", editingClient.id), data);
        toast.success("Risk setting updated");
      } else {
        await addDoc(collection(db, "protected_clients"), { ...data, createdAt: serverTimestamp() });
        toast.success("Risk setting added");
      }
      setIsDialogOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save risk setting");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to remove this risk rule?")) {
      await deleteDoc(doc(db, "protected_clients", id));
      toast.success("Risk rule removed");
    }
  };

  const combinedRows = useMemo(() => {
    const rows: any[] = [];
    const usedRuleIds = new Set<string>();

    // First add all clients and merge existing rules
    allClients.forEach(client => {
      const rule = protectedClients.find(p => 
        p.linkedClientId === client.id || 
        (p.email && p.email.toLowerCase() === client.email?.toLowerCase()) ||
        (p.phone && p.phone === client.phone)
      );
      if (rule) usedRuleIds.add(rule.id);
      
      rows.push({
        id: client.id,
        isRuleOnly: false,
        fullName: client.name || "Unknown",
        phone: client.phone,
        email: client.email,
        isActive: rule ? rule.isActive : false,
        protectionLevel: rule ? rule.protectionLevel : "Low",
        ruleId: rule ? rule.id : null,
        client: client,
        rule: rule || null
      });
    });

    // Add rules that don't map to any specific client
    protectedClients.forEach(rule => {
       if (!usedRuleIds.has(rule.id)) {
         rows.push({
            id: rule.id,
            isRuleOnly: true,
            fullName: rule.fullName || "Unknown",
            phone: rule.phone,
            email: rule.email,
            isActive: rule.isActive,
            protectionLevel: rule.protectionLevel,
            ruleId: rule.id,
            client: null,
            rule: rule
         });
       }
    });

    return rows.filter(r => 
      r.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phone?.includes(searchTerm) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allClients, protectedClients, searchTerm]);

  const openNewDialog = () => {
     setEditingClient(null);
     setFormData({
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
        protectionLevel: "Low",
        requiredDepositType: "fixed",
        requiredDepositValue: 0,
        isActive: true,
        linkedClientId: ""
     });
     setIsDialogOpen(true);
  };

  const handleEditClick = (row: any) => {
     if (row.rule) {
        setEditingClient(row.rule);
        setFormData({
          fullName: row.rule.fullName || row.fullName || "",
          phone: row.rule.phone || row.phone || "",
          email: row.rule.email || row.email || "",
          address: row.rule.address || row.client?.address || "",
          vehicleYear: row.rule.vehicleYear || "",
          vehicleMake: row.rule.vehicleMake || "",
          vehicleModel: row.rule.vehicleModel || "",
          vin: row.rule.vin || "",
          licensePlate: row.rule.licensePlate || "",
          riskReason: row.rule.riskReason || "",
          internalNotes: row.rule.internalNotes || "",
          protectionLevel: row.rule.protectionLevel || "Low",
          requiredDepositType: row.rule.requiredDepositType || "fixed",
          requiredDepositValue: row.rule.requiredDepositValue || 0,
          isActive: row.rule.isActive !== undefined ? row.rule.isActive : true,
          linkedClientId: row.rule.linkedClientId || (row.client ? row.client.id : "")
        });
     } else {
        setEditingClient(null); // Creating new rule for existing client
        setFormData({
          fullName: row.fullName || "",
          phone: row.phone || "",
          email: row.email || "",
          address: row.client?.address || "",
          vehicleYear: "",
          vehicleMake: "",
          vehicleModel: "",
          vin: "",
          licensePlate: "",
          riskReason: "",
          internalNotes: "",
          protectionLevel: "Low",
          requiredDepositType: "fixed",
          requiredDepositValue: 0,
          isActive: true,
          linkedClientId: row.client?.id || ""
        });
     }
     setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6 pb-24 w-full">
      <PageHeader 
        title="Risk Management"
        accentWord="Management"
        subtitle="View and manually adjust risk levels or flag clients for special handling."
        actions={
          <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-6 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105" onClick={openNewDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Custom Rule
          </Button>
        }
      />
      <Card className="border-none bg-card rounded-3xl overflow-hidden shadow-xl">
        <div className="p-8 border-b border-white/5 bg-black/40">
           <Input placeholder="Search clients or rules..." className="bg-white/5 border-white/10 text-white font-bold rounded-2xl h-14" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest px-8 w-1/4">Client</TableHead>
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">Protection Level</TableHead>
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest w-1/3">Risk Details (Reason)</TableHead>
              <TableHead className="text-white/40 font-black uppercase text-[10px] tracking-widest">Active Rule</TableHead>
              <TableHead className="text-right px-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {combinedRows.map(row => (
              <TableRow key={row.id} className="border-white/5 hover:bg-white/5">
                <TableCell className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", row.isRuleOnly ? "bg-red-500/20" : "bg-[#0A4DFF]/20")}>
                      {row.isRuleOnly ? <Shield className="w-4 h-4 text-red-500" /> : <User className="w-4 h-4 text-[#0A4DFF]" />}
                    </div>
                    <div>
                      <p className="font-bold text-white leading-none">{row.fullName}</p>
                      <p className="text-xs text-white/40 mt-1">{row.email || row.phone || "No Contact Info"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-3 py-1",
                    row.protectionLevel === "Low" ? "bg-green-500/10 text-green-500 border-green-500/20" : 
                    row.protectionLevel === "High" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                    "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                  )}>
                    {row.protectionLevel}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.rule?.riskReason ? (
                     <div className="text-xs text-white/80 line-clamp-2 max-w-sm font-medium" title={row.rule.riskReason}>{row.rule.riskReason}</div>
                  ) : (
                     <span className="text-xs text-white/20 italic font-medium">None</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.rule ? (
                    <Switch 
                      checked={row.isActive} 
                      onCheckedChange={async (val) => {
                        try {
                          await updateDoc(doc(db, "protected_clients", row.ruleId), { isActive: val, updatedAt: serverTimestamp() });
                          toast.success(`Risk protection ${val ? 'activated' : 'deactivated'}`);
                          // No need to update local state as listener will catch it (if onSnapshot is used)
                          // Wait, ProtectedClients uses getDocs in useEffect. I should update local state manually or use onSnapshot.
                          setProtectedClients(prev => prev.map(p => p.id === row.ruleId ? { ...p, isActive: val } : p));
                        } catch (err) {
                          toast.error("Failed to update protection status");
                        }
                      }}
                    />
                  ) : (
                    <span className="text-white/20 text-xs">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right px-8">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(row)} title="Adjust Risk">
                      <Edit2 className="w-4 h-4 text-white/40 hover:text-white" />
                    </Button>
                    {row.ruleId && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(row.ruleId)} title="Remove Risk Rule">
                        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-400" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {combinedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-white/40">
                  No clients or risk rules found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl sm:max-w-[700px]">
          <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
            <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase flex items-center gap-2">
              <Shield className="w-6 h-6 text-orange-500" />
              {editingClient ? "Adjust Risk Profile" : "Set Risk Profile"}
            </DialogTitle>
          </DialogHeader>
           <DialogBody>
             <form onSubmit={handleSave} className="space-y-4">
             {!editingClient && !formData.linkedClientId && (
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
             )}
             <div className="grid grid-cols-2 gap-4">
                <Input name="fullName" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="Full Name" required className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
                <Input name="phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="Phone" required className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
             </div>
             <Input name="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Email" className="bg-white/5 border-white/10 text-white rounded-xl h-12" />
             <Textarea name="riskReason" value={formData.riskReason} onChange={e => setFormData({...formData, riskReason: e.target.value})} placeholder="Reason for risk setting..." required className="bg-white/5 border-white/10 text-white rounded-xl" />
             <Select value={formData.protectionLevel} onValueChange={(val: any) => setFormData({...formData, protectionLevel: val})}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12">
                   <SelectValue placeholder="Protection Level" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-white/10 text-white">
                   <SelectItem value="Low">Low Risk</SelectItem>
                   <SelectItem value="Med">Medium Risk</SelectItem>
                   <SelectItem value="High">High Risk</SelectItem>
                </SelectContent>
             </Select>
             <div className="flex items-center gap-4">
                <Switch name="isActive" checked={formData.isActive} onCheckedChange={(val) => setFormData({...formData, isActive: val})} />
                <Label className="text-white">Active Protection Rule</Label>
             </div>

             <div className="space-y-4 pt-4 border-t border-white/5">
                <Label className="uppercase tracking-widest text-[10px] text-white/40 font-bold">Manual Deposit Overrides</Label>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <Label className="text-white/60 text-xs">Deposit Type</Label>
                      <Select value={formData.requiredDepositType} onValueChange={(val: any) => setFormData({...formData, requiredDepositType: val})}>
                         <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-11">
                            <SelectValue />
                         </SelectTrigger>
                         <SelectContent className="bg-gray-900 border-white/10 text-white">
                            <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                         </SelectContent>
                      </Select>
                   </div>
                   <div className="space-y-2">
                      <Label className="text-white/60 text-xs">Value ({formData.requiredDepositType === 'fixed' ? '$' : '%'})</Label>
                      <Input 
                        type="number" 
                        value={formData.requiredDepositValue} 
                        onChange={e => setFormData({...formData, requiredDepositValue: parseFloat(e.target.value) || 0})} 
                        className="bg-white/5 border-white/10 text-white rounded-xl h-11" 
                      />
                   </div>
                </div>
                <p className="text-[10px] text-white/30 italic">These values will override standard service deposit settings if this rule is active for the client.</p>
             </div>

             <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-14 rounded-xl font-black uppercase tracking-[0.2em]">{editingClient ? "Save Updates" : "Create Profile"}</Button>
          </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
