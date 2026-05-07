import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDocs } from "firebase/firestore";
import { cn } from "../lib/utils";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogBody } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, Check } from "lucide-react";
import { Plus, FileText, Edit2, Trash2, ShieldCheck, Settings2, AlertCircle, CheckCircle2, ShieldAlert, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

export default function FormsBuilder() {
  const { profile, loading: authLoading, canAccessManager, systemStatus } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    category: "liability",
    content: "",
    acknowledgments: [] as string[],
    requiresSignature: true,
    requiresPrintedName: true,
    requiresDate: true,
    requiresInitials: false,
    requiresPhoto: false,
    isActive: true,
    assignedServices: [] as string[],
    assignedAddons: [] as string[],
    assignedToRetail: true,
    assignedToVendors: true,
    enforcement: "before_start"
  });

  const [newAck, setNewAck] = useState("");

  useEffect(() => {
    if (authLoading || !profile || !canAccessManager) return;

    // Listen to form templates
    const q = query(collection(db, "form_templates"));
    const unsubscribeTemplates = onSnapshot(q, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error listening to form templates:", error);
      handleFirestoreError(error, OperationType.GET, "form_templates");
    });

    // Listen to services for real-time mapping
    const unsubscribeServices = onSnapshot(collection(db, "services"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServices(data);
      localStorage.setItem('cached_services_forms', JSON.stringify(data));
    }, (error) => {
      console.error("Error listening to services in FormsBuilder:", error);
      const cached = localStorage.getItem('cached_services_forms');
      if (cached) {
        try { setServices(JSON.parse(cached)); } catch (e) {}
      }
    });

    // Listen to addons for real-time mapping
    const unsubscribeAddons = onSnapshot(collection(db, "addons"), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAddons(data);
      localStorage.setItem('cached_addons_forms', JSON.stringify(data));
    }, (error) => {
      console.error("Error listening to addons in FormsBuilder:", error);
      const cached = localStorage.getItem('cached_addons_forms');
      if (cached) {
        try { setAddons(JSON.parse(cached)); } catch (e) {}
      }
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeServices();
      unsubscribeAddons();
    };
  }, [profile, authLoading]);

  if (!canAccessManager) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Access Restricted</h2>
        <p className="text-white/60 font-medium text-center max-w-md px-6">
          You do not have permission to access the Forms Builder protocol. This area is restricted to administrative clearance levels.
        </p>
        <Button onClick={() => window.history.back()} variant="outline" className="border-white/10 text-white/40 hover:text-white">Go Back</Button>
      </div>
    );
  }

  const handleOpenEdit = (template?: any) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        category: template.category || "liability",
        content: template.content,
        acknowledgments: template.acknowledgments || [],
        requiresSignature: template.requiresSignature ?? true,
        requiresPrintedName: template.requiresPrintedName ?? true,
        requiresDate: template.requiresDate ?? true,
        requiresInitials: template.requiresInitials ?? false,
        requiresPhoto: template.requiresPhoto ?? false,
        isActive: template.isActive ?? true,
        assignedServices: template.assignedServices || [],
        assignedAddons: template.assignedAddons || [],
        assignedToRetail: template.assignedToRetail ?? true,
        assignedToVendors: template.assignedToVendors ?? true,
        enforcement: template.enforcement || "before_start"
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        title: "",
        category: "liability",
        content: "",
        acknowledgments: [],
        requiresSignature: true,
        requiresPrintedName: true,
        requiresDate: true,
        requiresInitials: false,
        requiresPhoto: false,
        isActive: true,
        assignedServices: [],
        assignedAddons: [],
        assignedToRetail: true,
        assignedToVendors: true,
        enforcement: "before_start"
      });
    }
    setShowEditDialog(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Title and Content are required");
      return;
    }

    const isRestricted = systemStatus === 'offline' || systemStatus === 'quota-exhausted';
    
    // Supplement names for IDs
    const assignedServiceNames = formData.assignedServices
      .map(id => services.find(s => s.id === id)?.name)
      .filter(Boolean);
    const assignedAddonNames = formData.assignedAddons
      .map(id => addons.find(a => a.id === id)?.name)
      .filter(Boolean);

    const saveData = {
      ...formData,
      assignedServiceNames,
      assignedAddonNames,
      updatedAt: serverTimestamp()
    };

    try {
      if (isRestricted) {
        toast.info("Offline/Quota Mode: Template saved locally (pending sync).", {
          description: "Database is unreachable. Changes will sync when reconnected."
        });
        // Optimistically update local state if we had a dedicated local storage sync, 
        // but for now we just close the dialog.
        setShowEditDialog(false);
        return;
      }

      if (editingTemplate) {
        const newVersion = (editingTemplate.version || 1) + 1;
        await updateDoc(doc(db, "form_templates", editingTemplate.id), {
          ...saveData,
          version: newVersion
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, "form_templates/" + editingTemplate.id));
        toast.success("Form template updated to version " + newVersion);
      } else {
        await addDoc(collection(db, "form_templates"), {
          ...saveData,
          version: 1,
          createdAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, "form_templates"));
        toast.success("Form template created");
      }
      setShowEditDialog(false);
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic delete
    const previousTemplates = [...templates];
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Template deleted");
    
    // Background sync
    try {
      await deleteDoc(doc(db, "form_templates", id));
    } catch (error) {
      // Revert if error
      setTemplates(previousTemplates);
      toast.error("Failed to delete template");
    }
  };

  const addAcknowledgment = () => {
    if (!newAck.trim()) return;
    setFormData(prev => ({
      ...prev,
      acknowledgments: [...prev.acknowledgments, newAck.trim()]
    }));
    setNewAck("");
  };

  const removeAcknowledgment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acknowledgments: prev.acknowledgments.filter((_, i) => i !== index)
    }));
  };

  const toggleService = (id: string) => {
    setFormData(prev => ({
      ...prev,
      assignedServices: prev.assignedServices.includes(id)
        ? prev.assignedServices.filter(sid => sid !== id)
        : [...prev.assignedServices, id]
    }));
  };

  const toggleAddon = (id: string) => {
    setFormData(prev => ({
      ...prev,
      assignedAddons: prev.assignedAddons.includes(id)
        ? prev.assignedAddons.filter(aid => aid !== id)
        : [...prev.assignedAddons, id]
    }));
  };

  // Role check handled above at component level

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Forms & WAIVERS" 
        accentWord="WAIVERS" 
        subtitle="Legal Compliance & Protocol Management"
        actions={
          <Button 
            onClick={() => handleOpenEdit()} 
            className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4 mr-2" />
            Initialize Protocol
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <Card key={template.id} className="border-none shadow-sm hover:shadow-md transition-shadow bg-white overflow-hidden flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="p-2 bg-red-50 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <Badge variant={template.isActive ? "default" : "secondary"} className={template.isActive ? "bg-green-100 text-green-700" : ""}>
                  {template.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <CardTitle className="mt-4 text-lg font-bold">{template.title}</CardTitle>
              <CardDescription className="capitalize">{template.category} • v{template.version || 1}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div className="text-sm text-gray-500 line-clamp-3">
                {template.content}
              </div>
              <div className="flex flex-wrap gap-1">
                {template.assignedServices?.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">{template.assignedServices.length} Services</Badge>
                )}
                {template.assignedAddons?.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">{template.assignedAddons.length} Add-ons</Badge>
                )}
                <Badge variant="outline" className="text-[10px] capitalize">{template.enforcement.replace("_", " ")}</Badge>
              </div>
            </CardContent>
            <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex justify-end gap-2">
              <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(template)} className="h-9 w-9 p-0 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-xl">
                <Edit2 className="w-4 h-4" />
              </Button>
              <DeleteConfirmationDialog
                trigger={
                  <Button variant="ghost" size="icon" className="h-9 w-9 p-0 text-white hover:text-white bg-red-500/10 hover:bg-red-500 rounded-xl">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                }
                title="Delete Form Template?"
                itemName={template.title}
                onConfirm={() => handleDelete(template.id)}
              />
            </div>
          </Card>
        ))}

        {templates.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center space-y-4 bg-white rounded-2xl border-2 border-dashed border-gray-100">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-gray-300" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-gray-900">No forms created yet</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">Create your first liability waiver or acknowledgment form to start enforcing them in your workflow.</p>
            </div>
            <Button onClick={() => handleOpenEdit()} variant="outline" className="font-bold">
              Get Started
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card border-none rounded-3xl shadow-2xl shadow-black">
          <DialogHeader className="p-6 border-b border-white/5 bg-black/40 shrink-0">
            <DialogTitle className="text-xl font-black text-white uppercase tracking-tighter">
              {editingTemplate ? "Edit Form Template" : "Create New Form Template"}
            </DialogTitle>
          </DialogHeader>
          
          <DialogBody className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Form Title</Label>
                <Input 
                  placeholder="e.g. General Liability Waiver" 
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-white border-gray-200 text-[#111111] h-12 rounded-xl font-bold placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={v => setFormData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="bg-white border-gray-200 text-[#111111] h-12 rounded-xl font-bold focus:bg-white focus:text-[#111111]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200 text-[#111111]">
                    <SelectItem value="liability">Liability Waiver</SelectItem>
                    <SelectItem value="acknowledgment">Acknowledgment</SelectItem>
                    <SelectItem value="inspection">Pre-Service Inspection</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label>Form Content (Markdown supported)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-64">
                <Textarea 
                  placeholder="Enter the legal text or acknowledgment content here..."
                  className="h-full resize-none font-mono text-xs bg-white border-gray-200 text-[#111111] rounded-xl p-4 placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                  value={formData.content}
                  onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                />
                <div className="h-full overflow-y-auto p-4 bg-gray-50 rounded-lg border border-gray-200 prose prose-sm max-w-none text-[#111111]">
                  <ReactMarkdown>{formData.content || "*Preview will appear here*"}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Required Fields & Actions</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.requiresSignature} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresSignature: v }))} 
                  />
                  <Label className="text-xs">Signature</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.requiresPrintedName} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresPrintedName: v }))} 
                  />
                  <Label className="text-xs">Printed Name</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.requiresDate} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresDate: v }))} 
                  />
                  <Label className="text-xs">Date</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.requiresInitials} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresInitials: v }))} 
                  />
                  <Label className="text-xs">Initials</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.requiresPhoto} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, requiresPhoto: v }))} 
                  />
                  <Label className="text-xs">Photo Attachment</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg bg-white">
                  <Switch 
                    checked={formData.isActive} 
                    onCheckedChange={v => setFormData(prev => ({ ...prev, isActive: v }))} 
                  />
                  <Label className="text-xs">Active Template</Label>
                </div>
              </div>
            </div>

            {/* Acknowledgments */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Required Acknowledgment Checkboxes</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g. I agree that the vehicle is in the condition stated above." 
                  value={newAck}
                  onChange={e => setNewAck(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addAcknowledgment()}
                  className="bg-white border-gray-200 text-[#111111] placeholder:text-gray-400 focus:bg-white focus:text-[#111111]"
                />
                <Button type="button" onClick={addAcknowledgment} variant="secondary" className="bg-primary text-white hover:bg-primary/90">Add</Button>
              </div>
              <div className="space-y-2">
                {formData.acknowledgments.map((ack, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-sm font-medium text-[#111111]">{ack}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeAcknowledgment(index)} className="text-white hover:text-white bg-red-500/20 hover:bg-red-500 h-8 w-8 p-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignments */}
            <div className="space-y-4">
              <Label className="text-base font-bold">Workflow Assignments</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Enforcement Trigger</Label>
                  <Select value={formData.enforcement} onValueChange={v => setFormData(prev => ({ ...prev, enforcement: v }))}>
                    <SelectTrigger className="bg-white border-gray-200 text-[#111111] focus:bg-white focus:text-[#111111]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200 text-[#111111]">
                      <SelectItem value="before_start">Before Starting Job</SelectItem>
                      <SelectItem value="before_complete">Before Completing Job</SelectItem>
                      <SelectItem value="before_invoice">Before Sending Invoice</SelectItem>
                      <SelectItem value="before_payment">Before Taking Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client Type Assignment</Label>
                  <div className="flex gap-4 p-3 border rounded-lg bg-white">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="assign-retail" 
                        checked={formData.assignedToRetail}
                        onCheckedChange={(v: boolean) => setFormData(prev => ({ ...prev, assignedToRetail: v }))}
                      />
                      <Label htmlFor="assign-retail" className="text-sm">Retail Clients</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="assign-vendor" 
                        checked={formData.assignedToVendors}
                        onCheckedChange={(v: boolean) => setFormData(prev => ({ ...prev, assignedToVendors: v }))}
                      />
                      <Label htmlFor="assign-vendor" className="text-sm">Vendors</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Assign to Services</Label>
                  <Popover>
                    <PopoverTrigger className="w-full h-12 flex items-center justify-between border border-gray-200 bg-white text-[#111111] hover:bg-gray-50 rounded-xl px-4 text-sm font-bold transition-colors">
                      <span className="truncate">
                        {formData.assignedServices.length > 0 
                          ? `${formData.assignedServices.length} Services Selected` 
                          : "Select Services..."}
                      </span>
                      <ChevronDown className="w-4 h-4 opacity-50 ml-2" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 bg-white border-gray-200 rounded-2xl shadow-xl z-[200]" align="start">
                      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <Input 
                          placeholder="Filter services..." 
                          className="h-8 border-none focus:ring-0 text-xs text-[#111111]"
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase();
                            document.querySelectorAll('[data-service-popover-item]').forEach((item: any) => {
                              const name = item.getAttribute('data-name').toLowerCase();
                              item.style.display = name.includes(val) ? 'flex' : 'none';
                            });
                          }}
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                        {services.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs italic px-4">
                            No services found — add services in Services & Add-ons.
                          </div>
                        ) : (
                          <div className="flex gap-2 mb-2 p-1 border-b pb-2">
                            <Button 
                              variant="ghost" 
                              type="button"
                              size="sm" 
                              className="h-7 text-[9px] uppercase font-bold text-primary"
                              onClick={() => setFormData(p => ({ ...p, assignedServices: services.map(s => s.id) }))}
                            >
                              All
                            </Button>
                            <Button 
                              variant="ghost" 
                              type="button"
                              size="sm" 
                              className="h-7 text-[9px] uppercase font-bold text-red-500"
                              onClick={() => setFormData(p => ({ ...p, assignedServices: [] }))}
                            >
                              None
                            </Button>
                          </div>
                        )}
                        {services.map(s => (
                          <div 
                            key={s.id}
                            data-service-popover-item
                            data-name={s.name}
                            onClick={() => toggleService(s.id)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                              formData.assignedServices.includes(s.id) ? "bg-primary/10 text-primary" : "hover:bg-gray-50 text-[#111111]"
                            )}
                          >
                            <span className="text-xs font-bold">{s.name}</span>
                            {formData.assignedServices.includes(s.id) && <Check className="w-3 h-3" />}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-wrap gap-1">
                    {formData.assignedServices.map(sid => {
                      const s = services.find(srv => srv.id === sid);
                      if (!s) return null;
                      return (
                        <Badge key={sid} variant="secondary" className="bg-primary/5 text-primary border-none text-[9px] font-bold py-1">
                          {s.name}
                          <X className="w-2 h-2 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleService(sid); }} />
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-bold">Assign to Add-ons / Enhancements</Label>
                  <Popover>
                    <PopoverTrigger className="w-full h-12 flex items-center justify-between border border-gray-200 bg-white text-[#111111] hover:bg-gray-50 rounded-xl px-4 text-sm font-bold transition-colors">
                      <span className="truncate">
                        {formData.assignedAddons.length > 0 
                          ? `${formData.assignedAddons.length} Items Selected` 
                          : "Select Add-ons..."}
                      </span>
                      <ChevronDown className="w-4 h-4 opacity-50 ml-2" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 bg-white border-gray-200 rounded-2xl shadow-xl z-[200]" align="start">
                      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <Input 
                          placeholder="Filter add-ons..." 
                          className="h-8 border-none focus:ring-0 text-xs text-[#111111]"
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase();
                            document.querySelectorAll('[data-addon-popover-item]').forEach((item: any) => {
                              const name = item.getAttribute('data-name').toLowerCase();
                              item.style.display = name.includes(val) ? 'flex' : 'none';
                            });
                          }}
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                        {addons.length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-xs italic px-4">
                            No add-ons found — add add-ons in Services & Add-ons.
                          </div>
                        ) : (
                          <div className="flex gap-2 mb-2 p-1 border-b pb-2">
                            <Button 
                              variant="ghost" 
                              type="button"
                              size="sm" 
                              className="h-7 text-[9px] uppercase font-bold text-primary"
                              onClick={() => setFormData(p => ({ ...p, assignedAddons: addons.map(a => a.id) }))}
                            >
                              All
                            </Button>
                            <Button 
                              variant="ghost" 
                              type="button"
                              size="sm" 
                              className="h-7 text-[9px] uppercase font-bold text-red-500"
                              onClick={() => setFormData(p => ({ ...p, assignedAddons: [] }))}
                            >
                              None
                            </Button>
                          </div>
                        )}
                        {addons.map(a => (
                          <div 
                            key={a.id}
                            data-addon-popover-item
                            data-name={a.name}
                            onClick={() => toggleAddon(a.id)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                              formData.assignedAddons.includes(a.id) ? "bg-[#2A6CFF]/10 text-[#2A6CFF]" : "hover:bg-gray-50 text-[#111111]"
                            )}
                          >
                            <span className="text-xs font-bold">{a.name}</span>
                            {formData.assignedAddons.includes(a.id) && <Check className="w-3 h-3" />}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-wrap gap-1">
                    {formData.assignedAddons.map(aid => {
                      const a = addons.find(add => add.id === aid);
                      if (!a) return null;
                      return (
                        <Badge key={aid} variant="secondary" className="bg-[#2A6CFF]/5 text-[#2A6CFF] border-none text-[9px] font-bold py-1">
                          {a.name}
                          <X className="w-2 h-2 ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleAddon(aid); }} />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-6 border-t shrink-0">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-widest text-[10px] shadow-glow-blue transition-all hover:scale-105">
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
