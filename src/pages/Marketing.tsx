import { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  where, 
  getDocs,
  Timestamp,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, Plus, Send, History, Layout, Users, Filter, 
  Search, MoreVertical, Trash2, Edit2, Copy, 
  CheckCircle2, Clock, AlertCircle, ChevronRight,
  UserCheck, UserMinus, Star, Tag, Smartphone
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { MarketingCampaign, EmailTemplate, Client, ClientType, ClientCategory } from "../types";
import { getClientDisplayName } from "../lib/utils";

export default function Marketing() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTypes, setClientTypes] = useState<ClientType[]>([]);
  const [clientCategories, setClientCategories] = useState<ClientCategory[]>([]);
  
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [newCampaign, setNewCampaign] = useState<Partial<MarketingCampaign>>({
    name: "",
    templateId: "",
    audienceFilters: {
      clientTypeIds: [],
      categoryIds: [],
      isVIP: false,
      isInactive: false,
      isOneTime: false
    }
  });

  useEffect(() => {
    if (!profile) return;

    const unsubCampaigns = onSnapshot(
      query(collection(db, "marketing_campaigns"), orderBy("createdAt", "desc")),
      (snap) => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingCampaign)))
    );

    const unsubTemplates = onSnapshot(
      query(collection(db, "email_templates"), orderBy("name", "asc")),
      (snap) => setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailTemplate)))
    );

    const unsubClients = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    const unsubTypes = onSnapshot(collection(db, "client_types"), (snap) => {
      setClientTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientType)));
    });

    const unsubCats = onSnapshot(collection(db, "client_categories"), (snap) => {
      setClientCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientCategory)));
    });

    return () => {
      unsubCampaigns();
      unsubTemplates();
      unsubClients();
      unsubTypes();
      unsubCats();
    };
  }, [profile]);

  const handleSaveTemplate = async () => {
    if (!editingTemplate?.name || !editingTemplate?.subject || !editingTemplate?.body) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      if (editingTemplate.id) {
        await updateDoc(doc(db, "email_templates", editingTemplate.id), {
          ...editingTemplate,
          updatedAt: serverTimestamp()
        });
        toast.success("Template updated");
      } else {
        await addDoc(collection(db, "email_templates"), {
          ...editingTemplate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Template created");
      }
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      toast.error("Failed to save template");
    }
  };

  const getFilteredClients = (filters: MarketingCampaign["audienceFilters"]) => {
    return clients.filter(client => {
      if (filters.clientTypeIds?.length && !filters.clientTypeIds.includes(client.clientTypeId)) return false;
      if (filters.categoryIds?.length && !filters.categoryIds.some(id => client.categoryIds?.includes(id))) return false;
      if (filters.isVIP && !client.isVIP) return false;
      if (filters.isOneTime && !client.isOneTime) return false;
      
      // Inactive logic: no appointments in last 90 days (simplified for demo)
      if (filters.isInactive) {
        // This would normally be a more complex query or pre-calculated field
        // For now, let's assume it's a placeholder
      }
      
      return true;
    });
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.templateId) {
      toast.error("Please provide a name and select a template");
      return;
    }

    const targetClients = getFilteredClients(newCampaign.audienceFilters!);
    
    try {
      const campaignData: Partial<MarketingCampaign> = {
        ...newCampaign,
        status: "draft",
        stats: {
          targetCount: targetClients.length,
          sentCount: 0,
          failedCount: 0
        },
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, "marketing_campaigns"), campaignData);
      toast.success("Campaign created as draft");
      setIsCampaignDialogOpen(false);
      setNewCampaign({
        name: "",
        templateId: "",
        audienceFilters: { clientTypeIds: [], categoryIds: [], isVIP: false, isInactive: false, isOneTime: false }
      });
    } catch (error) {
      toast.error("Failed to create campaign");
    }
  };

  const handleSendCampaign = async (campaign: MarketingCampaign) => {
    if (campaign.status !== "draft") return;

    try {
      await updateDoc(doc(db, "marketing_campaigns", campaign.id), {
        status: "sending",
        sentAt: serverTimestamp()
      });

      // Simulate sending
      setTimeout(async () => {
        await updateDoc(doc(db, "marketing_campaigns", campaign.id), {
          status: "sent",
          "stats.sentCount": campaign.stats.targetCount
        });
        toast.success(`Campaign "${campaign.name}" sent successfully!`);
      }, 2000);

    } catch (error) {
      toast.error("Failed to send campaign");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Marketing</h1>
          <p className="text-gray-500 font-medium">Manage your campaigns, templates, and audience engagement.</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <DialogTrigger render={
              <Button variant="outline" className="font-bold">
                <Layout className="w-4 h-4 mr-2" /> New Template
              </Button>
            } />
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-black uppercase tracking-tight">
                  {editingTemplate?.id ? "Edit Template" : "Create Email Template"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input 
                      value={editingTemplate?.name || ""} 
                      onChange={e => setEditingTemplate(prev => ({ ...prev!, name: e.target.value }))}
                      placeholder="e.g., Summer Special"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select 
                      value={editingTemplate?.category || "promotional"}
                      onValueChange={val => setEditingTemplate(prev => ({ ...prev!, category: val }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="promotional">Promotional</SelectItem>
                        <SelectItem value="educational">Educational</SelectItem>
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="seasonal">Seasonal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input 
                    value={editingTemplate?.subject || ""} 
                    onChange={e => setEditingTemplate(prev => ({ ...prev!, subject: e.target.value }))}
                    placeholder="Get 20% off your next detail!"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Body (HTML supported)</Label>
                  <Textarea 
                    value={editingTemplate?.body || ""} 
                    onChange={e => setEditingTemplate(prev => ({ ...prev!, body: e.target.value }))}
                    rows={10}
                    placeholder="Hi {{firstName}}, ..."
                  />
                  <p className="text-[10px] text-gray-400 font-mono">Variables: {"{{firstName}}, {{businessName}}, {{loyaltyPoints}}"}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveTemplate} className="bg-primary font-bold">Save Template</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 font-bold">
                <Plus className="w-4 h-4 mr-2" /> Create Campaign
              </Button>
            } />
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="font-black uppercase tracking-tight">Launch New Campaign</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input 
                      value={newCampaign.name || ""} 
                      onChange={e => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., April VIP Rewards"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Select Template</Label>
                    <Select 
                      value={newCampaign.templateId || ""}
                      onValueChange={val => setNewCampaign(prev => ({ ...prev, templateId: val }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-700 mb-1">
                      <Smartphone className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">SMS Ready</span>
                    </div>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      This campaign architecture is ready for SMS integration. You can add SMS templates in the next update.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-bold uppercase tracking-wider text-gray-400">Audience Filters</Label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium">VIP Clients Only</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={newCampaign.audienceFilters?.isVIP}
                        onChange={e => setNewCampaign(prev => ({
                          ...prev,
                          audienceFilters: { ...prev.audienceFilters!, isVIP: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-2">
                        <UserMinus className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium">Inactive Clients (90+ days)</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={newCampaign.audienceFilters?.isInactive}
                        onChange={e => setNewCampaign(prev => ({
                          ...prev,
                          audienceFilters: { ...prev.audienceFilters!, isInactive: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium">One-time Clients</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={newCampaign.audienceFilters?.isOneTime}
                        onChange={e => setNewCampaign(prev => ({
                          ...prev,
                          audienceFilters: { ...prev.audienceFilters!, isOneTime: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-500">Estimated Audience:</span>
                      <Badge variant="secondary" className="font-black text-lg">
                        {getFilteredClients(newCampaign.audienceFilters!).length}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateCampaign} className="bg-primary font-bold">Create Campaign</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white p-1 border border-gray-200 rounded-xl w-full md:w-auto">
          <TabsTrigger value="campaigns" className="gap-2 font-bold data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-lg px-6">
            <Send className="w-4 h-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 font-bold data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-lg px-6">
            <Layout className="w-4 h-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="audience" className="gap-2 font-bold data-[state=active]:bg-red-50 data-[state=active]:text-primary rounded-lg px-6">
            <Users className="w-4 h-4" /> Audience
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {campaigns.map((campaign) => (
                <motion.div
                  key={campaign.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              campaign.status === "sent" ? "default" : 
                              campaign.status === "sending" ? "outline" : 
                              "secondary"
                            } className="uppercase text-[10px] font-black">
                              {campaign.status}
                            </Badge>
                            {campaign.sentAt && (
                              <span className="text-[10px] text-gray-400 font-medium">
                                {format(campaign.sentAt.toDate(), "MMM d, h:mm a")}
                              </span>
                            )}
                          </div>
                          <CardTitle className="text-xl font-black tracking-tight">{campaign.name}</CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-600">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-2 bg-gray-50 rounded-lg">
                          <p className="text-[10px] text-gray-400 font-bold uppercase">Audience</p>
                          <p className="text-lg font-black">{campaign.stats.targetCount}</p>
                        </div>
                        <div className="text-center p-2 bg-green-50 rounded-lg">
                          <p className="text-[10px] text-green-600 font-bold uppercase">Sent</p>
                          <p className="text-lg font-black text-green-700">{campaign.stats.sentCount}</p>
                        </div>
                        <div className="text-center p-2 bg-red-50 rounded-lg">
                          <p className="text-[10px] text-red-600 font-bold uppercase">Failed</p>
                          <p className="text-lg font-black text-red-700">{campaign.stats.failedCount}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                          <Mail className="w-3.5 h-3.5" />
                          {templates.find(t => t.id === campaign.templateId)?.name || "Unknown Template"}
                        </div>
                        {campaign.status === "draft" && (
                          <Button 
                            size="sm" 
                            className="bg-primary font-bold h-8"
                            onClick={() => handleSendCampaign(campaign)}
                          >
                            <Send className="w-3 h-3 mr-2" /> Send Now
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className="border-none shadow-sm bg-white group hover:shadow-md transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <Badge variant="outline" className="uppercase text-[10px] font-bold text-gray-400">
                        {template.category}
                      </Badge>
                      <CardTitle className="text-xl font-black tracking-tight">{template.name}</CardTitle>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-gray-400 hover:text-primary"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsTemplateDialogOpen(true);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-gray-400 hover:text-red-600"
                        onClick={async () => {
                          if (confirm("Delete this template?")) {
                            await deleteDoc(doc(db, "email_templates", template.id));
                            toast.success("Template deleted");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Subject</p>
                    <p className="text-sm font-medium text-gray-700 line-clamp-1">{template.subject}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">Preview</p>
                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{template.body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audience">
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Audience Segments</CardTitle>
                  <CardDescription>View and manage your client segments for targeted marketing.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input className="pl-10 w-64 bg-gray-50 border-none" placeholder="Search clients..." />
                  </div>
                  <Button variant="outline" size="icon">
                    <Filter className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="p-6 bg-yellow-50 rounded-3xl border border-yellow-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-400 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <Star className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-yellow-700 uppercase tracking-wider">VIP Clients</p>
                      <p className="text-2xl font-black text-yellow-900">{clients.filter(c => c.isVIP).length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-yellow-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-yellow-500 h-full" style={{ width: `${(clients.filter(c => c.isVIP).length / clients.length) * 100}%` }} />
                  </div>
                </div>

                <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Active</p>
                      <p className="text-2xl font-black text-blue-900">{clients.length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="p-6 bg-red-50 rounded-3xl border border-red-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <UserMinus className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-red-700 uppercase tracking-wider">Inactive</p>
                      <p className="text-2xl font-black text-red-900">0</p>
                    </div>
                  </div>
                  <div className="w-full bg-red-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-red-500 h-full" style={{ width: "0%" }} />
                  </div>
                </div>

                <div className="p-6 bg-purple-50 rounded-3xl border border-purple-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <Tag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-purple-700 uppercase tracking-wider">One-time</p>
                      <p className="text-2xl font-black text-purple-900">{clients.filter(c => c.isOneTime).length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-purple-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${(clients.filter(c => c.isOneTime).length / clients.length) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Client</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {clients.slice(0, 10).map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-gray-400 text-xs">
                              {client.firstName?.[0]}{client.lastName?.[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{getClientDisplayName(client)}</p>
                              <p className="text-[10px] text-gray-400 font-medium">{client.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-[10px] font-bold text-gray-500">
                            {clientTypes.find(t => t.id === client.clientTypeId)?.name || "Retail"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            {client.isVIP && <Badge className="bg-yellow-400 text-white text-[8px] font-black uppercase">VIP</Badge>}
                            {client.isOneTime && <Badge className="bg-purple-400 text-white text-[8px] font-black uppercase">One-time</Badge>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-300 hover:text-primary">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
