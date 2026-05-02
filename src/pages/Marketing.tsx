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
  where, 
  getDocs,
  getDoc,
  Timestamp,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
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
  UserCheck, UserMinus, Star, Tag, Smartphone,
  Zap, TrendingUp, Target, Rocket, Sparkles,
  ArrowUpRight, BarChart3, PieChart, Loader2,
  Ticket, ExternalLink
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { MarketingCampaign, EmailTemplate, Client, ClientType, ClientCategory, Appointment, Lead, Invoice, BusinessSettings, WeatherInfo, Coupon } from "../types";
import { cn, getClientDisplayName } from "../lib/utils";
import { askAssistant, AIResponse } from "../services/gemini";
import { fetchWeather } from "../services/weatherService";
import { Progress } from "@/components/ui/progress";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";

import { 
  Cloud, 
  Sun, 
  CloudRain, 
  CloudLightning, 
  Thermometer, 
  Wind,
  Instagram,
  Facebook,
  Twitter,
  Video,
  Hash
} from "lucide-react";

function MarketingIntelligence({ data }: { data: any }) {
  if (!data) return (
    <Card className="border-dashed border-2 border-white/10 bg-transparent">
      <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
          <BarChart3 className="w-8 h-8 text-white/20" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-white text-lg uppercase tracking-tight">Intelligence Offline</h3>
          <p className="text-white text-sm max-w-xs mx-auto font-medium">Not enough data to generate insights. Start adding leads and quotes to unlock your metrics.</p>
        </div>
      </CardContent>
    </Card>
  );

  const topSource = Object.entries(data.sources as Record<string, any>)
    .sort((a, b) => b[1].count - a[1].count)[0];

  const highestRevenueSource = Object.entries(data.sources as Record<string, any>)
    .sort((a, b) => b[1].revenue - a[1].revenue)[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#121212]/60 border-white/5 backdrop-blur-sm shadow-xl">
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-white">Total Pipeline</p>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-3xl font-black text-white tracking-tighter">${data.totalRevenue.toLocaleString()}</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge className="bg-green-500/10 text-green-500 border-none text-[8px] font-black uppercase">Lifetime Revenue</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212]/60 border-white/5 backdrop-blur-sm shadow-xl">
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-white">Response Speed</p>
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <p className="text-3xl font-black text-white tracking-tighter">{Math.round(data.avgResponseTime)}m</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase">Avg Lead Followup</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212]/60 border-white/5 backdrop-blur-sm border-l-4 border-l-red-600 shadow-xl">
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-primary">Leak Alert</p>
              <AlertCircle className="w-4 h-4 text-primary" />
            </div>
            <p className="text-3xl font-black text-white tracking-tighter">{data.uncontactedCount} Leads</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase">Inactive / Missed</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212]/60 border-white/5 backdrop-blur-sm shadow-xl">
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-white">Top Funnel</p>
              <Target className="w-4 h-4 text-white" />
            </div>
            <p className="text-xl font-black text-white uppercase tracking-tighter truncate leading-tight py-1">
              {topSource ? topSource[0] : "None"}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge className="bg-white/10 text-white border-none text-[8px] font-black uppercase">Primary Source</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#121212]/80 border-white/5 border-none shadow-2xl">
          <CardHeader>
            <CardTitle className="text-white font-black uppercase tracking-tight text-lg">Funnel Accuracy</CardTitle>
            <CardDescription className="text-white text-xs font-medium">Tracking conversion performance from lead to paid revenue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {[
                { label: "Total Leads", value: data.funnel.leads, color: "bg-zinc-700" },
                { label: "Contacted", value: data.funnel.contacted, color: "bg-[#0A4DFF]" },
                { label: "Quoted", value: data.funnel.quoted, color: "bg-amber-600" },
                { label: "Converted", value: data.funnel.converted, color: "bg-green-600" },
                { label: "Paid", value: data.funnel.paid, color: "bg-primary" }
              ].map((stage, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">{stage.label}</span>
                    <span className="text-xs font-black text-white">{stage.value}</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(stage.value / (data.funnel.leads || 1)) * 100}%` }}
                      className={cn("h-full rounded-full transition-all shadow-[0_0_10px_rgba(0,0,0,0.5)]", stage.color)} 
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-black text-white uppercase tracking-tight">Conversion Rating</span>
              </div>
              <span className="text-2xl font-black text-white">
                {data.funnel.leads > 0 ? Math.round((data.funnel.converted / data.funnel.leads) * 100) : 0}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212]/80 border-white/5 border-none shadow-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="text-white font-black uppercase tracking-tight text-lg">Lead Source Intel</CardTitle>
            <CardDescription className="text-white text-xs font-medium">Acquisition performance by generation channel.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white">Source</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-white">Volume</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-white">CR%</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-white">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {Object.entries(data.sources as Record<string, any>).map(([name, stats], idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-black text-white uppercase tracking-tight truncate block max-w-[140px]">{name}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-white">{stats.count}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className="text-[10px] font-black text-green-500 border-green-500/20 bg-green-500/5">
                          {Math.round((stats.converted / (stats.count || 1)) * 100)}%
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-white tracking-tight">${stats.revenue.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-primary/5 border border-primary/20 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <Rocket className="w-3 h-3" /> Growth Insight
            </h4>
            <div className="space-y-2">
              <p className="text-white font-black text-lg line-clamp-1">
                {highestRevenueSource ? `${highestRevenueSource[0]} Is Your Engine` : "No Revenue Attribution"}
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                {highestRevenueSource 
                  ? `${highestRevenueSource[0]} accounts for $${highestRevenueSource[1].revenue.toLocaleString()} in revenue. This is your most profitable channel.` 
                  : "We need more transaction data to track where your revenue is being generated."}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#0A4DFF]/5 border border-[#0A4DFF]/20 rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Zap className="w-12 h-12 text-[#0A4DFF]" />
          </div>
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-[#0A4DFF] uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3 h-3" /> Efficiency Protocol
            </h4>
            <div className="space-y-2">
              <p className="text-white font-black text-lg line-clamp-1">
                {data.avgResponseTime < 10 ? "Speed Kills. Elite Work." : "Response Latency Detected"}
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                {data.avgResponseTime < 10
                  ? "Your response rate is exceptional. Fast leads are 7x more likely to convert."
                  : `Average response is ${Math.round(data.avgResponseTime)}m. Target < 5m to drastically increase ROAS.`}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-amber-600/5 border border-amber-600/20 rounded-2xl p-6 relative overflow-hidden group shadow-lg shadow-amber-900/5">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Filter className="w-12 h-12 text-amber-500" />
          </div>
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> Revenue Safeguard
            </h4>
            <div className="space-y-2">
              <p className="text-white font-black text-lg line-clamp-1">
                {data.unconvertedCount > 0 ? "Pipeline Friction Identified" : "Zero Leakage Detected"}
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                {data.unconvertedCount > 0
                  ? `You have ${data.unconvertedCount} unconverted quotes. Follow up within 24 hours to recover this capital.`
                  : "All current opportunities are moving through the funnel with high efficiency."}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function Marketing() {
  const { profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("ai-assistant");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientTypes, setClientTypes] = useState<ClientType[]>([]);
  const [clientCategories, setClientCategories] = useState<ClientCategory[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isCouponDialogOpen, setIsCouponDialogOpen] = useState(false);
  
  const [isGeneratingGrowth, setIsGeneratingGrowth] = useState(false);
  const [growthStrategy, setGrowthStrategy] = useState<AIResponse | null>(null);
  const [marketingQuery, setMarketingQuery] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [aiChatResponse, setAiChatResponse] = useState<string | null>(null);
  
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Partial<MarketingCampaign> | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);

  const intelligence = useMemo(() => {
    if (leads.length === 0) return null;

    const sources: Record<string, { count: number; converted: number; revenue: number }> = {};
    leads.forEach(lead => {
      const source = lead.source || "Manual";
      if (!sources[source]) sources[source] = { count: 0, converted: 0, revenue: 0 };
      sources[source].count++;
      
      // Calculate revenue if lead was converted
      const leadRevenue = invoices
        .filter(i => i.leadId === lead.id && i.paymentStatus === "paid")
        .reduce((sum, i) => sum + i.total, 0);
      
      sources[source].revenue += leadRevenue;
      if (lead.status === "converted" || leadRevenue > 0) {
        sources[source].converted++;
      }
    });

    const funnel = {
      leads: leads.length,
      contacted: leads.filter(l => l.contactedAt || l.status === "contacted").length,
      quoted: leads.filter(l => l.quotedAt || l.status === "quoted").length,
      converted: leads.filter(l => l.status === "converted" || l.convertedAt).length,
      paid: invoices.filter(i => i.leadId && i.paymentStatus === "paid").length
    };

    const uncontactedLeads = leads.filter(l => !l.contactedAt && l.status === "new");
    const unconvertedLeads = leads.filter(l => l.status === "quoted" && !l.convertedAt);

    const responseTimes = leads
      .filter(l => l.contactedAt && l.createdAt)
      .map(l => {
        const created = l.createdAt instanceof Timestamp ? l.createdAt.toDate().getTime() : new Date(l.createdAt as any).getTime();
        const contacted = l.contactedAt instanceof Timestamp ? l.contactedAt.toDate().getTime() : new Date(l.contactedAt as any).getTime();
        return contacted - created;
      });
    const avgResponseTime = responseTimes.length > 0 ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) / (1000 * 60) : 0; // in minutes

    return {
      sources,
      funnel,
      uncontactedCount: uncontactedLeads.length,
      unconvertedCount: unconvertedLeads.length,
      avgResponseTime,
      totalRevenue: invoices.filter(i => i.paymentStatus === "paid").reduce((sum, i) => sum + i.total, 0)
    };
  }, [leads, invoices]);

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
    if (authLoading || !profile) return;

    // Optimized Data Fetcher (Fetch once on mount to save quota)
    const fetchMarketingAggregateData = async () => {
      try {
        const [
          campaignsSnap,
          templatesSnap,
          clientsSnap,
          typesSnap,
          catsSnap,
          apptsSnap,
          leadsSnap,
          invoicesSnap,
          settingsSnap,
          couponsSnap
        ] = await Promise.all([
          getDocs(query(collection(db, "marketing_campaigns"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "email_templates"), orderBy("name", "asc"))),
          getDocs(collection(db, "clients")),
          getDocs(collection(db, "client_types")),
          getDocs(collection(db, "client_categories")),
          getDocs(collection(db, "appointments")),
          getDocs(collection(db, "leads")),
          getDocs(collection(db, "invoices")),
          getDoc(doc(db, "settings", "business")),
          getDocs(query(collection(db, "coupons"), orderBy("createdAt", "desc")))
        ]);

        setCampaigns(campaignsSnap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingCampaign)));
        setTemplates(templatesSnap.docs.map(d => ({ id: d.id, ...d.data() } as EmailTemplate)));
        setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
        setClientTypes(typesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientType)));
        setClientCategories(catsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientCategory)));
        setAppointments(apptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
        setLeads(leadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
        setInvoices(invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
        setCoupons(couponsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));

        if (settingsSnap.exists()) {
          const businessSettings = settingsSnap.data() as BusinessSettings;
          setSettings(businessSettings);
          if (businessSettings.baseLatitude && businessSettings.baseLongitude) {
            setIsFetchingWeather(true);
            fetchWeather(businessSettings.baseLatitude, businessSettings.baseLongitude)
              .then(setWeather)
              .finally(() => setIsFetchingWeather(false));
          }
        }
      } catch (error) {
        console.error("Error fetching marketing data:", error);
      }
    };

    fetchMarketingAggregateData();
    return () => {};
  }, [profile, authLoading]);

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
      
      // Inactive logic: no appointments in last 90 days
      if (filters.isInactive) {
        const clientAppointments = appointments.filter(a => a.clientId === client.id || a.customerId === client.id);
        if (clientAppointments.length === 0) return false; 
        
        const lastAppt = clientAppointments.reduce((latest, current) => {
          const currentData = current.scheduledAt instanceof Timestamp ? current.scheduledAt.toDate() : new Date(current.scheduledAt as any);
          const latestData = latest.scheduledAt instanceof Timestamp ? latest.scheduledAt.toDate() : new Date(latest.scheduledAt as any);
          return currentData > latestData ? current : latest;
        });
        
        const lastDate = lastAppt.scheduledAt instanceof Timestamp ? lastAppt.scheduledAt.toDate() : new Date(lastAppt.scheduledAt as any);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        if (lastDate >= ninetyDaysAgo) return false;
      }
      
      return true;
    });
  };

  const handleSaveCoupon = async () => {
    if (!editingCoupon?.code || !editingCoupon?.discountValue) {
      toast.error("Please provide a code and discount value");
      return;
    }

    try {
      const couponData = {
        ...editingCoupon,
        code: editingCoupon.code.toUpperCase().replace(/\s+/g, ""),
        isActive: editingCoupon.isActive ?? true,
        usageCount: editingCoupon.usageCount ?? 0,
        updatedAt: serverTimestamp(),
      };

      if (editingCoupon.id) {
        await updateDoc(doc(db, "coupons", editingCoupon.id), couponData);
        toast.success("Coupon updated");
      } else {
        await addDoc(collection(db, "coupons"), {
          ...couponData,
          createdAt: serverTimestamp(),
        });
        toast.success("Coupon created");
      }
      setIsCouponDialogOpen(false);
      setEditingCoupon(null);
    } catch (error) {
      console.error("Error saving coupon:", error);
      toast.error("Failed to save coupon");
    }
  };

  const handleCreateCampaign = async () => {
    const campaignToSave = editingCampaign || newCampaign;
    if (!campaignToSave.name || !campaignToSave.templateId) {
      toast.error("Please provide a name and select a template");
      return;
    }

    const targetClients = getFilteredClients(campaignToSave.audienceFilters!);
    
    try {
      const campaignData: Partial<MarketingCampaign> = {
        ...campaignToSave,
        status: campaignToSave.status || "draft",
        stats: {
          targetCount: targetClients.length,
          sentCount: campaignToSave.stats?.sentCount || 0,
          failedCount: campaignToSave.stats?.failedCount || 0
        },
        updatedAt: serverTimestamp()
      };

      if (campaignToSave.id) {
        await updateDoc(doc(db, "marketing_campaigns", campaignToSave.id), campaignData);
        toast.success("Campaign updated");
      } else {
        await addDoc(collection(db, "marketing_campaigns"), {
          ...campaignData,
          createdAt: serverTimestamp()
        });
        toast.success("Campaign created as draft");
      }
      setIsCampaignDialogOpen(false);
      setEditingCampaign(null);
      setNewCampaign({
        name: "",
        templateId: "",
        audienceFilters: { clientTypeIds: [], categoryIds: [], isVIP: false, isInactive: false, isOneTime: false }
      });
    } catch (error) {
      toast.error("Failed to save campaign");
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

  const generateGrowthStrategy = async (customQuery?: string) => {
    const isDirectQuestion = !!customQuery;
    if (isGeneratingGrowth || isAskingAI) return;

    // Add debounce check
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_marketing_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between AI requests.");
      return;
    }
    localStorage.setItem('last_marketing_ai_action', now.toString());

    if (isDirectQuestion) setIsAskingAI(true);
    else setIsGeneratingGrowth(true);

    try {
      console.log(`[Marketing AI] Triggered: ${isDirectQuestion ? "Direct Question" : "Strategy Generation"}`);
      const totalRevenue = invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.total, 0);
      const pendingRevenue = invoices.filter(i => i.status !== "paid").reduce((sum, i) => sum + i.total, 0);
      const upcomingAppointments = appointments.filter(a => a.status === "scheduled" || a.status === "confirmed");
      const projectedRevenue = upcomingAppointments.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

      const context = {
        businessName: settings?.businessName || "DetailFlow",
        clientCount: clients.length,
        vipCount: clients.filter(c => c.isVIP).length,
        oneTimeCount: clients.filter(c => c.isOneTime).length,
        leadCount: leads.length,
        activeLeads: leads.filter(l => l.status !== "converted" && l.status !== "lost").length,
        campaignCount: campaigns.length,
        totalRevenue,
        pendingRevenue,
        projectedRevenue,
        upcomingAppointmentCount: upcomingAppointments.length,
        intelligence,
        recentCampaigns: campaigns.slice(0, 3).map(c => ({ name: c.name, status: c.status, target: c.stats.targetCount })),
        topServices: Array.from(new Set(appointments.flatMap(a => a.serviceNames))).slice(0, 5),
        weather: weather ? {
          current: weather.current,
          forecast: weather.forecast.slice(0, 3),
          guidance: weather.businessGuidance
        } : null
      };

      const prompt = customQuery || "Generate a data-driven business growth and scaling strategy for DetailFlow Operations OS using the provided intelligence data. Focus on real retention metrics, acquisition cost by source, and high-margin upselling based on our performance. Provide specific campaign ideas and scaling insights based on our current funnel and revenue data. Do not use generic marketing buzzwords.";
      
      const strategy = await askAssistant(prompt, context);
      
      if (isDirectQuestion) {
        setAiChatResponse(strategy.suggestion);
        if (strategy.campaigns?.length || strategy.scalingInsights?.length) {
          setGrowthStrategy(strategy);
        }
      } else {
        setGrowthStrategy(strategy);
        setAiChatResponse(strategy.suggestion);
      }
      
      toast.success(isDirectQuestion ? "AI Assistant responded!" : "Growth strategy generated!");
    } catch (error: any) {
      console.error("AI Assistant error:", error);
      if (error.message?.includes("QUOTA_EXCEEDED")) {
        toast.error("Monthly spending cap reached. Please manage your limits at ai.studio/spend", {
          duration: 10000,
          action: {
            label: "Manage Cap",
            onClick: () => window.open("https://ai.studio/spend", "_blank")
          }
        });
      } else {
        toast.error("AI Assistant is currently unavailable. Please check your connection.");
      }
    } finally {
      setIsGeneratingGrowth(false);
      setIsAskingAI(false);
    }
  };

  const handleCreateCampaignFromAI = async (campaignIdea: any) => {
    try {
      // Create a template first
      const templateData = {
        name: `AI: ${campaignIdea.title}`,
        subject: campaignIdea.title,
        body: `Hi {{firstName}},\n\n${campaignIdea.messageAngle}\n\nOur current offer: ${campaignIdea.offer}${campaignIdea.coupon ? `\n\nUse code: ${campaignIdea.coupon.code}` : ""}\n\nGoal: ${campaignIdea.goal}\n\nBest,\nDetailFlow Team`,
        category: "promotional",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const templateRef = await addDoc(collection(db, "email_templates"), templateData);
      
      // Create coupon if suggested
      let couponId = "";
      if (campaignIdea.coupon) {
        const expiryDate = campaignIdea.coupon.expiryDays 
          ? Timestamp.fromDate(new Date(Date.now() + campaignIdea.coupon.expiryDays * 24 * 60 * 60 * 1000))
          : null;

        const couponData: Partial<Coupon> = {
          code: campaignIdea.coupon.code,
          title: campaignIdea.title,
          discountType: campaignIdea.coupon.discountType,
          discountValue: campaignIdea.coupon.discountValue,
          isActive: true,
          usageCount: 0,
          createdAt: Timestamp.now(),
          expiryDate: expiryDate as any,
          targetAudience: campaignIdea.targetAudience
        };
        const couponRef = await addDoc(collection(db, "coupons"), couponData);
        couponId = couponRef.id;
      }

      // Then open campaign dialog with this template selected
      setNewCampaign({
        name: campaignIdea.title,
        templateId: templateRef.id,
        audienceFilters: {
          clientTypeIds: [],
          categoryIds: [],
          isVIP: campaignIdea.targetAudience.toLowerCase().includes("vip"),
          isInactive: campaignIdea.targetAudience.toLowerCase().includes("inactive"),
          isOneTime: campaignIdea.targetAudience.toLowerCase().includes("one-time")
        }
      });
      setIsCampaignDialogOpen(true);
      toast.success("Template created and campaign draft ready!");
    } catch (error) {
      toast.error("Failed to create campaign from AI suggestion");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <PageHeader 
        title="Marketing" 
        accentWord="Marketing" 
        subtitle="Manage your campaigns, templates, and audience engagement."
        actions={
          <div className="flex gap-3">
            <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
              <DialogTrigger render={
                <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]">
                  <Layout className="w-4 h-4 mr-2 text-primary" /> New Template
                </Button>
              } />
              <DialogContent className="max-w-2xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
                <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">
                    {editingTemplate?.id ? "Edit Template" : "Create Email Template"}
                  </DialogTitle>
                </DialogHeader>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Template Name</Label>
                      <Input 
                        value={editingTemplate?.name || ""} 
                        onChange={e => setEditingTemplate(prev => ({ ...prev!, name: e.target.value }))}
                        placeholder="e.g., Summer Special"
                        className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Category</Label>
                      <Select 
                        value={editingTemplate?.category || "promotional"}
                        onValueChange={val => setEditingTemplate(prev => ({ ...prev!, category: val }))}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-gray-900 border-white/10 text-white">
                          <SelectItem value="promotional">Promotional</SelectItem>
                          <SelectItem value="educational">Educational</SelectItem>
                          <SelectItem value="announcement">Announcement</SelectItem>
                          <SelectItem value="seasonal">Seasonal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Email Subject</Label>
                    <Input 
                      value={editingTemplate?.subject || ""} 
                      onChange={e => setEditingTemplate(prev => ({ ...prev!, subject: e.target.value }))}
                      placeholder="Get 20% off your next detail!"
                      className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Email Body (HTML supported)</Label>
                    <Textarea 
                      value={editingTemplate?.body || ""} 
                      onChange={e => setEditingTemplate(prev => ({ ...prev!, body: e.target.value }))}
                      rows={10}
                      placeholder="Hi {{firstName}}, ..."
                      className="bg-white/5 border-white/10 text-white rounded-xl min-h-[200px]"
                    />
                    <p className="text-[10px] text-white font-mono">Variables: {"{{firstName}}, {{businessName}}, {{loyaltyPoints}}"}</p>
                  </div>
                  <div className="flex gap-3 justify-end pt-4">
                    <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)} className="rounded-xl h-12 px-6 font-bold uppercase tracking-widest text-[10px]">Cancel</Button>
                    <Button onClick={handleSaveTemplate} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue">Save Template</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCampaignDialogOpen} onOpenChange={(open) => {
              setIsCampaignDialogOpen(open);
              if (!open) {
                setEditingCampaign(null);
                setNewCampaign({
                  name: "",
                  templateId: "",
                  audienceFilters: { clientTypeIds: [], categoryIds: [], isVIP: false, isInactive: false, isOneTime: false }
                });
              }
            }}>
              <DialogTrigger render={
                <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105">
                  <Plus className="w-4 h-4 mr-2" /> Create Campaign
                </Button>
              } />
              <DialogContent className="max-w-3xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
                <DialogHeader className="p-8 border-b border-white/10 bg-black/40">
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase header-glow">
                    {editingCampaign?.id ? "Edit Campaign" : "Launch New Campaign"}
                  </DialogTitle>
                </DialogHeader>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white">Campaign Name</Label>
                        <Input 
                          value={editingCampaign?.name || newCampaign.name || ""} 
                          onChange={e => {
                            if (editingCampaign) setEditingCampaign(prev => ({ ...prev!, name: e.target.value }));
                            else setNewCampaign(prev => ({ ...prev, name: e.target.value }));
                          }}
                          placeholder="e.g., April VIP Rewards"
                          className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="font-black uppercase tracking-widest text-[10px] text-white">Select Template</Label>
                        <Select 
                          value={editingCampaign?.templateId || newCampaign.templateId || ""}
                          onValueChange={val => {
                            if (editingCampaign) setEditingCampaign(prev => ({ ...prev!, templateId: val }));
                            else setNewCampaign(prev => ({ ...prev, templateId: val }));
                          }}
                        >
                          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                          <SelectContent className="bg-gray-900 border-white/10 text-white">
                            {templates.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="p-4 bg-[#0A4DFF]/5 rounded-xl border border-[#0A4DFF]/10">
                        <div className="flex items-center gap-2 text-[#0A4DFF] mb-1">
                          <Smartphone className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-wider">SMS Ready</span>
                        </div>
                        <p className="text-xs text-[#0A4DFF] leading-relaxed">
                          This campaign architecture is ready for SMS integration. You can add SMS templates in the next update.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-sm font-bold uppercase tracking-wider text-white">Audience Filters</Label>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm font-medium">VIP Clients Only</span>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={editingCampaign?.audienceFilters?.isVIP || newCampaign.audienceFilters?.isVIP}
                            onChange={e => {
                              const filters = { ...(editingCampaign?.audienceFilters || newCampaign.audienceFilters!), isVIP: e.target.checked };
                              if (editingCampaign) setEditingCampaign(prev => ({ ...prev!, audienceFilters: filters }));
                              else setNewCampaign(prev => ({ ...prev, audienceFilters: filters }));
                            }}
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
                            checked={editingCampaign?.audienceFilters?.isInactive || newCampaign.audienceFilters?.isInactive}
                            onChange={e => {
                              const filters = { ...(editingCampaign?.audienceFilters || newCampaign.audienceFilters!), isInactive: e.target.checked };
                              if (editingCampaign) setEditingCampaign(prev => ({ ...prev!, audienceFilters: filters }));
                              else setNewCampaign(prev => ({ ...prev, audienceFilters: filters }));
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-2">
                            <Tag className="w-4 h-4 text-[#0A4DFF]" />
                            <span className="text-sm font-medium">One-time Clients</span>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={editingCampaign?.audienceFilters?.isOneTime || newCampaign.audienceFilters?.isOneTime}
                            onChange={e => {
                              const filters = { ...(editingCampaign?.audienceFilters || newCampaign.audienceFilters!), isOneTime: e.target.checked };
                              if (editingCampaign) setEditingCampaign(prev => ({ ...prev!, audienceFilters: filters }));
                              else setNewCampaign(prev => ({ ...prev, audienceFilters: filters }));
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">Estimated Audience:</span>
                          <Badge variant="secondary" className="font-black text-lg">
                            {getFilteredClients(editingCampaign?.audienceFilters || newCampaign.audienceFilters!).length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end pt-8">
                    <Button variant="outline" onClick={() => setIsCampaignDialogOpen(false)} className="rounded-xl h-12 px-6 font-bold uppercase tracking-widest text-[10px]">Cancel</Button>
                    <Button onClick={handleCreateCampaign} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue">
                      {editingCampaign?.id ? "Update Campaign" : "Create Campaign"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="campaigns">
            <Send className="w-4 h-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="ai-assistant">
            <Sparkles className="w-4 h-4" /> AI Assistant
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Layout className="w-4 h-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="coupons">
            <Ticket className="w-4 h-4" /> Coupons
          </TabsTrigger>
          <TabsTrigger value="audience">
            <Users className="w-4 h-4" /> Audience
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-assistant" className="space-y-16 pb-20">
          {/* SECTION 1: INSIGHTS & SCALING */}
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Marketing Intelligence</h2>
                <p className="text-white font-medium text-sm">Real-time performance metrics and scaling indicators.</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] px-3 py-1">Direct Insight Engine</Badge>
                <Badge variant="outline" className="border-white/10 text-white font-black uppercase text-[10px] px-3 py-1">v2.4.0</Badge>
              </div>
            </div>

            <MarketingIntelligence data={intelligence} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Weather Context */}
              {weather && (
                <Card className="bg-[#0A4DFF] border-none text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform">
                    <Cloud className="w-16 h-16" />
                  </div>
                  <CardContent className="p-6 flex items-center gap-4 relative z-10">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                      <img 
                        src={`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`} 
                        alt={weather.current.condition}
                        className="w-10 h-10"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white">Market Conditions</p>
                      <h3 className="text-2xl font-black tracking-tight">{weather.current.temp}°F • {weather.current.condition}</h3>
                      <p className="text-xs font-bold text-white/60 mt-1 line-clamp-1">{weather.businessGuidance}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Business Health Snapshot */}
              <Card className="bg-zinc-900 border-white/10 text-white shadow-xl lg:col-span-2">
                <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white mb-1">Total Audience</p>
                    <p className="text-xl font-black text-white">{clients.length}</p>
                    <p className="text-[8px] font-bold text-green-500 uppercase mt-0.5">Verified CRM</p>
                  </div>
                  <div className="border-l border-white/5 pl-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white mb-1">Active Funnel</p>
                    <p className="text-xl font-black text-white">{leads.filter(l => l.status !== "converted" && l.status !== "lost").length}</p>
                    <p className="text-[8px] font-bold text-[#0A4DFF] uppercase mt-0.5">Potential Rev</p>
                  </div>
                  <div className="border-l border-white/5 pl-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white mb-1">Lead Health</p>
                    <p className="text-xl font-black text-green-500">GOOD</p>
                    <p className="text-[8px] font-bold text-white uppercase mt-0.5">System Status</p>
                  </div>
                  <div className="border-l border-white/5 pl-6">
                    <Button 
                      size="sm"
                      onClick={() => generateGrowthStrategy()} 
                      disabled={isGeneratingGrowth}
                      className="w-full bg-primary hover:bg-[#2A6CFF] text-white font-black h-10 rounded-xl shadow-glow-blue"
                    >
                      {isGeneratingGrowth ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3 mr-2" />}
                      {isGeneratingGrowth ? "Audit" : "Run Audit"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Scaling Insights Section */}
            {growthStrategy?.scalingInsights && (
              <div className="space-y-4 pt-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-primary" /> AI Scaling Insights
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {growthStrategy.scalingInsights.map((insight, i) => (
                    <Card key={i} className="bg-zinc-900/40 border-white/10 hover:border-primary/30 transition-all group shadow-lg">
                      <CardContent className="p-6 space-y-3">
                        <Badge className="bg-primary/10 text-primary border-none text-[8px] font-black uppercase">
                          <span className="text-xs font-bold text-white/60">Impact: {insight.impact}</span>
                        </Badge>
                        <p className="text-sm font-black text-white leading-tight group-hover:text-primary transition-colors">{insight.finding}</p>
                        <p className="text-xs text-white/70 leading-relaxed font-medium">{insight.recommendation}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: RECOMMENDED ACTIONS */}
          <div className="space-y-8 bg-zinc-900/20 p-8 rounded-[2rem] border border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-glow-blue">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Strategic Actions</h2>
                <p className="text-white font-medium text-sm">Targeted campaigns and high-impact maneuvers.</p>
              </div>
            </div>

            {aiChatResponse && (
              <Card className="border border-white/10 shadow-2xl bg-zinc-950 overflow-hidden">
                <CardHeader className="bg-white/5 border-b border-white/10 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <CardTitle className="text-sm font-black uppercase tracking-tighter text-white">AI Analysis Response</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setAiChatResponse(null)} className="h-8 w-8 p-0 text-white hover:bg-red-500 bg-red-500/10 hover:text-white rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="prose prose-sm prose-invert max-w-none text-white font-medium leading-relaxed">
                    <ReactMarkdown>{aiChatResponse}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {growthStrategy?.campaigns ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {growthStrategy.campaigns.map((campaign, idx) => (
                  <Card key={idx} className="border border-white/10 shadow-2xl bg-zinc-900 group hover:shadow-primary/5 transition-all overflow-hidden flex flex-col">
                    <CardHeader className="pb-4 bg-white/[0.02] border-b border-white/5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <Badge className="uppercase text-[9px] font-black border-none text-white bg-primary">
                            {campaign.channel} Engine
                          </Badge>
                          <CardTitle className="text-2xl font-black tracking-tight text-white group-hover:text-primary transition-colors">{campaign.title}</CardTitle>
                        </div>
                        <Button 
                          onClick={() => handleCreateCampaignFromAI(campaign)}
                          className="bg-zinc-800 hover:bg-primary text-white font-black h-12 px-6 rounded-xl transition-all"
                        >
                          Deploy Action
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8 flex-1">
                      <div className="grid grid-cols-2 gap-8">
                        <div>
                          <p className="text-[10px] font-black text-white uppercase mb-1 tracking-widest">Audience Segment</p>
                          <p className="text-sm font-black text-white">{campaign.targetAudience}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase mb-1 tracking-widest">Optimal Timing</p>
                          <p className="text-sm font-black text-white">{campaign.timing}</p>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-zinc-950 rounded-2xl border border-white/5 relative">
                        <p className="text-[10px] font-black text-primary uppercase mb-3 tracking-widest">Master Offer</p>
                        <p className="text-base font-bold text-white leading-relaxed">{campaign.offer}</p>
                        {campaign.coupon && (
                          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Ticket className="w-4 h-4 text-primary" />
                              <span className="text-sm font-black text-primary uppercase tracking-[0.2em]">{campaign.coupon.code}</span>
                            </div>
                            <Badge className="bg-white/10 text-white border-none text-[10px] font-black uppercase px-3 italic">
                              {campaign.coupon.discountType === "percentage" ? `${campaign.coupon.discountValue}% SAVINGS` : 
                               campaign.coupon.discountType === "fixed" ? `$${campaign.coupon.discountValue} DISCOUNT` : 
                               "PREMIUM UPGRADE"}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <Instagram className="w-4 h-4 text-pink-500" />
                          <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Social Media Assets</h4>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="bg-zinc-950 p-4 rounded-xl border-l-4 border-l-pink-500">
                            <p className="text-[9px] font-black text-pink-500 uppercase mb-1">Visual Directive</p>
                            <p className="text-xs font-bold text-zinc-100 italic">"{campaign.socialMedia.reelIdea}"</p>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                            <p className="text-[9px] font-black text-white/70 uppercase mb-1">Engagement Hook</p>
                              <p className="text-sm font-black text-white">{campaign.socialMedia.hook}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {campaign.socialMedia.hashtags.map((tag: string, i: number) => (
                                <span key={i} className="text-[10px] font-black text-[#0A4DFF] bg-[#0A4DFF]/10 px-2 py-0.5 rounded uppercase tracking-tighter">#{tag}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5 mt-auto flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Objective: {campaign.goal}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !aiChatResponse ? (
              <div className="py-20 text-center bg-zinc-900/40 rounded-[2rem] border-2 border-dashed border-white/5">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                  <Target className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Awaiting Strategy Commands</h3>
                <p className="text-white font-medium max-w-xs mx-auto mt-2 italic">Use the Marketing Director below to generate your next growth campaign.</p>
              </div>
            ) : null}
          </div>

          {/* SECTION 3: AI MARKETING ENGINE (TOOLS) */}
          <Card className="border-none shadow-2xl bg-zinc-900 overflow-hidden relative p-8 md:p-12 rounded-[2.5rem]">
            <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
              <TrendingUp className="w-64 h-64 text-white" />
            </div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-12">
              <div className="lg:col-span-2 space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-primary flex items-center justify-center shadow-glow-blue">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-white leading-none">AI Marketing Director</h2>
                  <p className="text-white font-medium mt-4 text-base leading-relaxed">
                    Access high-level strategy, generate cross-platform campaigns, and scale your operations with machine intelligence.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-8">
                <div className="relative group">
                  <Input 
                    placeholder="Describe your goal (e.g. Scale retention for classic car owners)" 
                    value={marketingQuery}
                    onChange={e => setMarketingQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && marketingQuery && generateGrowthStrategy(marketingQuery)}
                    className="bg-zinc-950 border-white/10 text-white placeholder:text-zinc-600 h-16 px-6 rounded-2xl text-lg font-bold group-focus-within:border-primary/50 transition-all shadow-2xl"
                  />
                  <div className="absolute right-2 top-2">
                    <Button 
                      onClick={() => generateGrowthStrategy(marketingQuery)}
                      disabled={isAskingAI || !marketingQuery}
                      className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-6 rounded-xl shadow-glow-blue"
                    >
                      {isAskingAI ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                      {isAskingAI ? "" : "Analyze"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Quick Presets</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Existing Clients", query: "Generate a campaign for my existing clients" },
                      { label: "Inactive Leads", query: "Generate a reactivation campaign for inactive leads" },
                      { label: "Repeat Bookings", query: "How do I increase repeat bookings this month?" },
                      { label: "Local Awareness", query: "How to increase local awareness in high-wealth zip codes?" },
                      { label: "High Margin", query: "Strategy for upselling high-margin specialized coatings" },
                      { label: "Referrals", query: "Create a review and referral incentive program" }
                    ].map((preset, i) => (
                      <Button 
                        key={i}
                        variant="outline" 
                        size="sm" 
                        onClick={() => generateGrowthStrategy(preset.query)}
                        className="bg-zinc-950 border-white/10 text-white hover:bg-zinc-800 hover:border-primary text-[10px] font-black uppercase h-9 px-4 rounded-lg transition-all"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

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
                  <Card className="border border-white/10 shadow-2xl bg-zinc-900/60 backdrop-blur-xl overflow-hidden group hover:shadow-primary/10 transition-all">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              campaign.status === "sent" ? "default" : 
                              campaign.status === "sending" ? "outline" : 
                              "secondary"
                            } className={cn(
                              "uppercase text-[10px] font-black",
                              campaign.status === "sent" ? "bg-green-500 text-white" : 
                              campaign.status === "sending" ? "border-primary text-primary" : 
                              "bg-white/10 text-white"
                            )}>
                              {campaign.status}
                            </Badge>
                            {campaign.sentAt && (
                              <span className="text-[10px] text-white font-medium">
                                {campaign.sentAt && format(campaign.sentAt.toDate(), "MMM d, h:mm a")}
                              </span>
                            )}
                          </div>
                          <CardTitle className="text-xl font-black tracking-tight text-white">{campaign.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          {campaign.status === "draft" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-white hover:text-primary hover:bg-white/5"
                              onClick={() => {
                                setEditingCampaign(campaign);
                                setIsCampaignDialogOpen(true);
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <DeleteConfirmationDialog
                            trigger={
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 text-white bg-red-500/10 hover:text-white hover:bg-red-600 rounded-xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            }
                            title="Purge Campaign?"
                            itemName={campaign.name}
                            onConfirm={async () => {
                              await deleteDoc(doc(db, "marketing_campaigns", campaign.id));
                              toast.success("Campaign deleted");
                            }}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-2 bg-white/5 rounded-lg border border-white/10">
                          <p className="text-[10px] text-white font-bold uppercase">Audience</p>
                          <p className="text-lg font-black text-white">{campaign.stats.targetCount}</p>
                        </div>
                        <div className="text-center p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                          <p className="text-[10px] text-green-500 font-bold uppercase">Sent</p>
                          <p className="text-lg font-black text-green-400">{campaign.stats.sentCount}</p>
                        </div>
                        <div className="text-center p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                          <p className="text-[10px] text-red-500 font-bold uppercase">Failed</p>
                          <p className="text-lg font-black text-red-400">{campaign.stats.failedCount}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <div className="flex items-center gap-2 text-xs text-white font-medium">
                          <Mail className="w-3.5 h-3.5" />
                          {templates.find(t => t.id === campaign.templateId)?.name || "Unknown Template"}
                        </div>
                        {campaign.status === "draft" && (
                          <Button 
                            size="sm" 
                            className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-8 shadow-glow-blue"
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
            <AnimatePresence mode="popLayout">
              {templates.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Card className="border border-white/10 shadow-2xl bg-zinc-900/60 backdrop-blur-xl overflow-hidden group hover:shadow-primary/10 transition-all">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <Badge variant="outline" className="uppercase text-[10px] font-black border-primary/30 text-primary bg-primary/5">
                            {template.category}
                          </Badge>
                          <CardTitle className="text-xl font-black tracking-tight text-white">{template.name}</CardTitle>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-white hover:text-primary hover:bg-white/5"
                            onClick={() => {
                              setEditingTemplate(template);
                              setIsTemplateDialogOpen(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <DeleteConfirmationDialog
                            trigger={
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 text-white bg-red-500/10 hover:text-white hover:bg-red-600 rounded-xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            }
                            title="Delete Template?"
                            itemName={template.name}
                            onConfirm={async () => {
                              await deleteDoc(doc(db, "email_templates", template.id));
                              toast.success("Template deleted");
                            }}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs font-bold text-white uppercase tracking-widest">Subject</p>
                      <p className="text-sm font-medium text-white line-clamp-2">{template.subject}</p>
                      <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                        <span className="text-[10px] text-white/60 font-medium">
                          Last updated {template.updatedAt && typeof template.updatedAt.toDate === 'function' ? format(template.updatedAt.toDate(), "MMM d, yyyy") : "Just now"}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-primary font-bold h-8 hover:bg-primary/10"
                          onClick={() => {
                            const newT = { ...template, id: undefined, name: `${template.name} (Copy)` };
                            setEditingTemplate(newT);
                            setIsTemplateDialogOpen(true);
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 mr-2" /> Clone
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="coupons" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">Active Coupons</h3>
              <p className="text-sm text-white font-medium">Manage your auto-generated and manual discount codes.</p>
            </div>
            <Dialog open={isCouponDialogOpen} onOpenChange={(open) => {
              setIsCouponDialogOpen(open);
              if (!open) setEditingCoupon(null);
            }}>
              <DialogTrigger render={
                <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105">
                  <Plus className="w-4 h-4 mr-2" /> Create Coupon
                </Button>
              } />
              <DialogContent className="max-w-xl bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black">
                <DialogHeader className="p-8 border-b border-white/10 bg-black/40">
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase header-glow">
                    {editingCoupon?.id ? "Edit Coupon" : "Create Manual Coupon"}
                  </DialogTitle>
                </DialogHeader>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Coupon Code</Label>
                      <Input 
                        value={editingCoupon?.code || ""} 
                        onChange={e => setEditingCoupon(prev => ({ ...prev!, code: e.target.value }))}
                        placeholder="e.g., SUMMER20"
                        className="bg-white/5 border-white/10 text-white rounded-xl h-12 uppercase font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Title</Label>
                      <Input 
                        value={editingCoupon?.title || ""} 
                        onChange={e => setEditingCoupon(prev => ({ ...prev!, title: e.target.value }))}
                        placeholder="e.g., Summer Special"
                        className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Discount Type</Label>
                      <Select 
                        value={editingCoupon?.discountType || "percentage"}
                        onValueChange={val => setEditingCoupon(prev => ({ ...prev!, discountType: val as any }))}
                      >
                        <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-12"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                          <SelectItem value="free_addon">Free Add-on</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-black uppercase tracking-widest text-[10px] text-white">Value</Label>
                      <Input 
                        type="number"
                        value={editingCoupon?.discountValue || ""} 
                        onChange={e => setEditingCoupon(prev => ({ ...prev!, discountValue: Number(e.target.value) }))}
                        placeholder="e.g., 20"
                        className="bg-white/5 border-white/10 text-white rounded-xl h-12"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white">Description</Label>
                      <Textarea 
                        value={editingCoupon?.description || ""} 
                        onChange={e => setEditingCoupon(prev => ({ ...prev!, description: e.target.value }))}
                        placeholder="e.g., Valid for all full details in July"
                        className="bg-white/5 border-white/10 text-white rounded-xl min-h-[100px]"
                      />
                  </div>
                  <div className="flex gap-3 justify-end pt-4">
                    <Button variant="outline" onClick={() => setIsCouponDialogOpen(false)} className="rounded-xl h-12 px-6 font-bold uppercase tracking-widest text-[10px]">Cancel</Button>
                    <Button onClick={handleSaveCoupon} className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue">Save Coupon</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {coupons.map((coupon) => (
                <motion.div
                  key={coupon.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Card className="border border-white/10 shadow-2xl bg-zinc-900/60 backdrop-blur-xl overflow-hidden group hover:shadow-primary/10 transition-all">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={coupon.isActive ? "default" : "secondary"} className={cn(
                              "uppercase text-[10px] font-black",
                              coupon.isActive ? "bg-green-500 text-white" : "bg-white/10 text-white/70"
                            )}>
                              {coupon.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {coupon.expiryDate && coupon.expiryDate instanceof Timestamp && (
                              <span className="text-[10px] text-white/60 font-medium">
                                Expires {format(coupon.expiryDate.toDate(), "MMM d")}
                              </span>
                            )}
                          </div>
                          <CardTitle className="text-2xl font-black tracking-tighter text-primary">{coupon.code}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-white/40 hover:text-primary hover:bg-white/5"
                            onClick={() => {
                              setEditingCoupon(coupon);
                              setIsCouponDialogOpen(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-white/40 hover:text-primary hover:bg-white/5"
                            onClick={() => {
                              navigator.clipboard.writeText(coupon.code);
                              toast.success("Code copied to clipboard");
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-white uppercase mb-1">Campaign / Title</p>
                        <p className="text-sm font-bold text-white">{coupon.title || "General Discount"}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                          <p className="text-[10px] font-black text-white uppercase mb-1">Discount</p>
                          <p className="text-lg font-black text-white">
                            {coupon.discountType === "percentage" ? `${coupon.discountValue}%` : 
                             coupon.discountType === "fixed" ? `$${coupon.discountValue}` : 
                             "FREE"}
                          </p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                          <p className="text-[10px] font-black text-white uppercase mb-1">Redemptions</p>
                          <p className="text-lg font-black text-white">{coupon.usageCount}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={cn("font-bold h-8", coupon.isActive ? "text-red-500 hover:text-red-600 hover:bg-red-500/10" : "text-green-500 hover:text-green-600 hover:bg-green-500/10")}
                          onClick={async () => {
                            await updateDoc(doc(db, "coupons", coupon.id), { isActive: !coupon.isActive });
                            toast.success(`Coupon ${coupon.isActive ? "deactivated" : "activated"}`);
                          }}
                        >
                          {coupon.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-white bg-red-500/10 hover:text-white hover:bg-red-600 rounded-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Purge Coupon?"
                          itemName={coupon.code}
                          onConfirm={async () => {
                            await deleteDoc(doc(db, "coupons", coupon.id));
                            toast.success("Coupon deleted");
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="audience">
          <Card className="border border-white/10 shadow-2xl bg-zinc-900/60 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Audience Segments</CardTitle>
                  <CardDescription className="text-white">View and manage your client segments for targeted marketing.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
                    <Input className="pl-10 w-64 bg-white/5 border-white/10 text-white placeholder:text-white" placeholder="Search clients..." />
                  </div>
                  <Button variant="outline" size="icon" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                    <Filter className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="p-6 bg-yellow-500/10 rounded-3xl border border-yellow-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <Star className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-yellow-500 uppercase tracking-wider">VIP Clients</p>
                      <p className="text-2xl font-black text-white">{clients.filter(c => c.isVIP).length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-yellow-500 h-full" style={{ width: `${(clients.filter(c => c.isVIP).length / clients.length) * 100}%` }} />
                  </div>
                </div>

                <div className="p-6 bg-[#0A4DFF]/5 rounded-3xl border border-[#0A4DFF]/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-[#0A4DFF] rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#0A4DFF] uppercase tracking-wider">Active</p>
                      <p className="text-2xl font-black text-white">{clients.length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#0A4DFF] h-full" style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="p-6 bg-red-500/10 rounded-3xl border border-red-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <UserMinus className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-wider">Inactive</p>
                      <p className="text-2xl font-black text-white">0</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-red-500 h-full" style={{ width: "0%" }} />
                  </div>
                </div>

                <div className="p-6 bg-purple-500/10 rounded-3xl border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-500 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <Tag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-purple-500 uppercase tracking-wider">One-time</p>
                      <p className="text-2xl font-black text-white">{clients.filter(c => c.isOneTime).length}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${(clients.filter(c => c.isOneTime).length / clients.length) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-wider">Client</th>
                      <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-transparent">
                    {clients.slice(0, 10).map((client) => (
                      <tr key={client.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center font-bold text-white text-xs">
                              {client.firstName?.[0]}{client.lastName?.[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{getClientDisplayName(client)}</p>
                              <p className="text-[10px] text-white/60 font-medium">{client.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-[10px] font-bold text-white border-white/10">
                            {clientTypes.find(t => t.id === client.clientTypeId)?.name || "Retail"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            {client.isVIP && <Badge className="bg-yellow-500 text-white text-[8px] font-black uppercase">VIP</Badge>}
                            {client.isOneTime && <Badge className="bg-purple-500 text-white text-[8px] font-black uppercase">One-time</Badge>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:text-primary">
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
