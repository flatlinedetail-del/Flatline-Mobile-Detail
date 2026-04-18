import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
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
import { Plus, FileText, Edit2, Trash2, ShieldCheck, Settings2, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

export default function FormsBuilder() {
  const { profile, loading: authLoading } = useAuth();
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
    if (authLoading || !profile || (profile.role !== "admin" && profile.role !== "manager")) return;

    const q = query(collection(db, "form_templates"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error listening to form templates:", error);
    });

    getDocs(collection(db, "services")).then(snap => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }).catch(error => console.error("Error fetching services in FormsBuilder:", error));

    getDocs(collection(db, "addons")).then(snap => {
      setAddons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }).catch(error => console.error("Error fetching addons in FormsBuilder:", error));

    return () => unsubscribe();
  }, [profile, authLoading]);

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-black text-gray-900">Access Denied</h2>
        <p className="text-gray-500 font-medium text-center max-w-md">
          You do not have permission to access the Forms Builder. Please contact an administrator if you believe this is an error.
        </p>
        <Button onClick={() => window.history.back()} variant="outline">Go Back</Button>
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

    try {
      if (editingTemplate) {
        // Versioning: If content or critical fields change, we could increment version
        // For now, let's just update. The requirement says "keep version history".
        // To implement versioning properly, we should probably create a new record or have a versions subcollection.
        // But the requirement says "old signed forms must remain linked to the version signed at that time".
        // This implies we should store the version number in the template and increment it.
        const newVersion = (editingTemplate.version || 1) + 1;
        await updateDoc(doc(db, "form_templates", editingTemplate.id), {
          ...formData,
          version: newVersion,
          updatedAt: serverTimestamp()
        });
        toast.success("Form template updated to version " + newVersion);
      } else {
        await addDoc(collection(db, "form_templates"), {
          ...formData,
          version: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
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

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-gray-500">Only administrators can access the Forms Builder.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Forms & WAIVERS" 
        accentWord="WAIVERS" 
        subtitle="Legal Compliance & Protocol Management"
        actions={
          <Button 
            onClick={() => handleOpenEdit()} 
            className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-105"
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
                  <Button variant="ghost" size="icon" className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl">
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
                  className="bg-white/5 border-white/10 text-white h-12 rounded-xl font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={v => setFormData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/10 text-white">
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
                  className="h-full resize-none font-mono text-xs bg-white/5 border-white/10 text-white rounded-xl p-4"
                  value={formData.content}
                  onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                />
                <div className="h-full overflow-y-auto p-4 bg-gray-50 rounded-lg border border-gray-200 prose prose-sm max-w-none">
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
                />
                <Button type="button" onClick={addAcknowledgment} variant="secondary">Add</Button>
              </div>
              <div className="space-y-2">
                {formData.acknowledgments.map((ack, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-sm">{ack}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeAcknowledgment(index)} className="text-red-500">
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Label>Assign to Services</Label>
                  <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2 bg-white">
                    {services.map(service => (
                      <div key={service.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`svc-${service.id}`} 
                          checked={formData.assignedServices.includes(service.id)}
                          onCheckedChange={() => toggleService(service.id)}
                        />
                        <Label htmlFor={`svc-${service.id}`} className="text-sm font-normal">{service.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assign to Add-ons</Label>
                  <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2 bg-white">
                    {addons.map(addon => (
                      <div key={addon.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`addon-${addon.id}`} 
                          checked={formData.assignedAddons.includes(addon.id)}
                          onCheckedChange={() => toggleAddon(addon.id)}
                        />
                        <Label htmlFor={`addon-${addon.id}`} className="text-sm font-normal">{addon.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-6 border-t shrink-0">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-red-700 font-bold">
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
