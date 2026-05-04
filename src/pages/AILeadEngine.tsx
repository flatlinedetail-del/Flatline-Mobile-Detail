import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, getDocs, Timestamp, getDoc, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  DatabaseZap, 
  Search, 
  MapPin, 
  Target, 
  TrendingUp, 
  MessageSquare, 
  Mail, 
  Phone, 
  Zap, 
  Filter, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Building2,
  Users,
  Star,
  DollarSign,
  ChevronRight,
  Loader2,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Globe,
  XCircle,
  Upload,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { Lead, BusinessSettings } from "../types";
import { aiLeadService } from "../services/aiLeadService";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const LEAD_TYPES = [
  { id: "collision_center", label: "Collision Centers", icon: Building2 },
  { id: "dealership", label: "Dealerships", icon: Target },
  { id: "fleet", label: "Fleet Accounts", icon: Zap },
  { id: "rental", label: "Rental Companies", icon: RefreshCcw },
  { id: "commercial", label: "Commercial Accounts", icon: Building2 },
  { id: "retail", label: "High-Value Retail", icon: Star },
];

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];

export default function AILeadEngine() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("generate");
  const [searchType, setSearchType] = useState("collision_center");
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState("10");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedLeads, setGeneratedLeads] = useState<any[]>([]);
  const [pipelineLeads, setPipelineLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showMarketReport, setShowMarketReport] = useState(false);

  const intelligenceMetrics = useMemo(() => {
    // 1. Conversion Insights
    const getConversionRate = (filterFn: (l: Lead) => boolean) => {
      const filteredLeads = pipelineLeads.filter(filterFn);
      if (filteredLeads.length === 0) return "0%";
      const converted = filteredLeads.filter(l => l.status === "converted").length;
      return `${Math.round((converted / filteredLeads.length) * 100)}%`;
    };

    const conversionInsights = [
      { label: "Internal Reactivation", rate: getConversionRate(l => !!l.isInternal), trend: "up" },
      { label: "Collision Centers", rate: getConversionRate(l => l.aiClassification === "Collision Center"), trend: "up" },
      { label: "Dealerships", rate: getConversionRate(l => l.aiClassification === "Dealership"), trend: "stable" },
      { label: "Market Search", rate: getConversionRate(l => l.source === "AI Market Search"), trend: "up" },
    ];

    // 2. Market Saturation
    const cityCounts: Record<string, number> = {};
    clients.forEach(c => {
      const city = c.city || "Other";
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    
    const totalClients = clients.length || 1;
    const marketSaturation = Object.entries(cityCounts)
      .map(([city, count]) => ({
        label: city,
        level: Math.round((count / totalClients) * 100),
        color: count / totalClients > 0.5 ? "bg-primary" : count / totalClients > 0.2 ? "bg-[#0A4DFF]" : "bg-purple-500"
      }))
      .sort((a, b) => b.level - a.level)
      .slice(0, 4);

    // If no data, provide defaults
    if (marketSaturation.length === 0) {
      marketSaturation.push({ label: "Awaiting Data", level: 0, color: "bg-white/10" });
    }

    // 3. Strategic Targets
    const hasFleetPotential = pipelineLeads.some(l => l.aiClassification === "Fleet" && l.status === "new");
    const strategicTarget = hasFleetPotential 
      ? "Prioritize Fleet accounts in the active pipeline. High-value acquisition potential detected in current market search results."
      : "Focus on internal reactivation. Data shows a significant number of inactive clients who haven't booked in over 90 days.";

    return { conversionInsights, marketSaturation, strategicTarget };
  }, [pipelineLeads, clients]);

  useEffect(() => {
    // Fetch settings for base location
    const fetchSettings = async () => {
      const docRef = doc(db, "settings", "business");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as BusinessSettings;
        setSettings(data);
        if (data.baseAddress) {
          setLocation(data.baseAddress);
        }
      }
    };
    fetchSettings();

    // Fetch data for intelligence (Fetch once on mount to save quota)
    const fetchLeadEngineData = async () => {
      try {
        const [leadsSnap, quotesSnap, appointmentsSnap, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(200))),
          getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc"), limit(200))),
          getDocs(query(collection(db, "appointments"), orderBy("scheduledAt", "desc"), limit(200))),
          getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(200)))
        ]);

        setPipelineLeads(leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)));
        setQuotes(quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setAppointments(appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      } catch (err) {
        console.error("Error fetching lead engine background data:", err);
        setLoading(false);
      }
    };

    fetchLeadEngineData();
    
    return () => {};
  }, []);

  const handleGenerateExternal = async () => {
    if (!location || isGenerating) return;

    // Debounce
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_lead_engine_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between action requests.");
      return;
    }
    localStorage.setItem('last_lead_engine_ai_action', now.toString());

    if (!location) {
      toast.error("Location required", {
        description: "Please enter a city, ZIP, or address to search for leads."
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedLeads([]);
    setGenerationProgress(0);
    
    try {
      const response = await fetch(`/api/leads/external?type=${searchType}&location=${location}&radius=${radius}`);
      const data = await response.json();

      if (data.error) {
        toast.error(data.error, {
          description: data.message || "Please check your configuration."
        });
        return;
      }

      if (data.results && data.results.length > 0) {
        toast.info(`Found ${data.results.length} businesses. Qualifying with AI...`);
        
        // Process one by one for maximum safety and quota compliance
        const qualified = [];
        for (let i = 0; i < data.results.length; i++) {
          const lead = data.results[i];
          try {
            console.log(`[AI Engine] Qualifying external lead ${i + 1}/${data.results.length}: ${lead.name}`);
            const qualifiedLead = await aiLeadService.qualifyLead(lead);
            qualified.push(qualifiedLead);
          } catch (err) {
            console.error(`Failed to qualify lead:`, err);
            qualified.push(lead);
          }
          setGenerationProgress(Math.round(((i + 1) / data.results.length) * 100));
          // Small delay between calls to be safe if quota is very tight
          await new Promise(r => setTimeout(r, 1000));
        }
        
        setGeneratedLeads(qualified);
        toast.success(`Market acquisition complete: ${qualified.length} leads qualified.`);
      } else {
        toast.info(data.message || "No results found for this area.");
      }
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to generate leads. Ensure your network connection is stable.");
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isGenerating) return;

    // Debounce
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_lead_engine_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between AI requests.");
      return;
    }
    localStorage.setItem('last_lead_engine_ai_action', now.toString());

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n");
      const headers = lines[0].split(",");
      
      const leads = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = line.split(",");
        const lead: any = {};
        headers.forEach((header, i) => {
          lead[header.trim()] = values[i]?.trim();
        });
        return {
          ...lead,
          source: "CSV Import",
          status: "new",
        };
      });

      setIsGenerating(true);
      try {
        const qualified = [];
        for (let i = 0; i < leads.length; i++) {
          console.log(`[AI Engine] Qualifying CSV lead ${i + 1}/${leads.length}`);
          const q = await aiLeadService.qualifyLead(leads[i]);
          qualified.push(q);
          setGenerationProgress(Math.round(((i + 1) / leads.length) * 100));
        }
        setGeneratedLeads(qualified);
        toast.success(`Imported and qualified ${qualified.length} leads.`);
      } catch (error) {
        toast.error("Failed to qualify imported leads");
      } finally {
        setIsGenerating(false);
      }
    };
    reader.readAsText(file);
  };

  const handleGenerateInternal = async () => {
    if (isGenerating) return;

    // Debounce
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_lead_engine_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between action requests.");
      return;
    }
    localStorage.setItem('last_lead_engine_ai_action', now.toString());

    setIsGenerating(true);
    setGenerationProgress(0);
    try {
      const internalLeads = await aiLeadService.generateInternalLeads();
      
      if (internalLeads.length === 0) {
        toast.info("No new internal opportunities found at this time.");
      } else {
        // Qualify each internal lead sequentially
        const qualifiedLeads = [];
        for (let i = 0; i < internalLeads.length; i++) {
          const lead = internalLeads[i];
          console.log(`[AI Engine] Qualifying internal lead ${i + 1}/${internalLeads.length}: ${lead.name}`);
          const qualified = await aiLeadService.qualifyLead(lead);
          qualifiedLeads.push(qualified);
          setGenerationProgress(Math.round(((i + 1) / internalLeads.length) * 100));
          await new Promise(r => setTimeout(r, 800));
        }
        setGeneratedLeads(qualifiedLeads);
        toast.success(`Retention Engine: Found and qualified ${qualifiedLeads.length} strategic opportunities.`);
      }
    } catch (error) {
      console.error("Internal generation error:", error);
      toast.error("Failed to scan internal data");
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleImportLead = async (lead: any) => {
    try {
      // Destructure to avoid saving ID if it exists
      const { id, ...leadData } = lead;
      
      await addDoc(collection(db, "leads"), {
        ...leadData,
        source: lead.source || "AI Lead Engine",
        status: "new",
        priority: lead.aiScore > 80 ? "hot" : lead.aiScore > 50 ? "medium" : "low",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      toast.success(`Imported ${lead.name} to pipeline`);
      setGeneratedLeads(prev => prev.filter(l => l.name !== lead.name));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "leads");
    }
  };

  const handleGenerateIntelligence = async (lead: Lead) => {
    setIsGenerating(true);
    try {
      const qualified = await aiLeadService.qualifyLead(lead);
      if (lead.id) {
        await updateDoc(doc(db, "leads", lead.id), {
          ...qualified,
          updatedAt: serverTimestamp()
        });
        toast.success("AI Intelligence generated and saved");
      }
      setSelectedLead(qualified as Lead);
    } catch (error: any) {
      console.error("AI Intelligence error:", error);
      if (error.message?.includes("QUOTA_EXCEEDED")) {
        toast.error("AI Quota Exceeded", {
          description: "Your Gemini API spending cap has been reached."
        });
      } else {
        toast.error("AI Service Unavailable", {
          description: "The AI engine is currently experiencing high demand. Please try again in a moment."
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">
            AI Lead <span className="text-primary">Acquisition</span> Engine
          </h1>
          <p className="text-white font-medium mt-1 uppercase tracking-widest text-[10px]">
            Strategic Intelligence & Market Domination System
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleCSVImport}
            accept=".csv"
            className="hidden"
          />
          <Button 
            variant="outline" 
            className="bg-white/5 text-white border-white/10 px-4 h-11 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Badge className="bg-primary/20 text-primary border-primary/20 px-3 py-1 font-black uppercase tracking-widest text-[10px] h-11 flex items-center">
            System Active
          </Badge>
          <Badge className="bg-white/5 text-white border-white/10 px-3 py-1 font-black uppercase tracking-widest text-[10px]">
            v4.2.0-AI
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="generate">
            <Zap className="w-4 h-4 mr-2" />
            Lead Generation
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <TrendingUp className="w-4 h-4 mr-2" />
            Lead Pipeline
          </TabsTrigger>
          <TabsTrigger value="intelligence">
            <DatabaseZap className="w-4 h-4 mr-2" />
            AI Intelligence
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-8 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Search Controls */}
            <Card className="lg:col-span-1 bg-white/5 border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
              <CardHeader className="p-8 border-b border-white/5 bg-black/20">
                <CardTitle className="text-xl font-black uppercase tracking-tighter text-white">Targeting <span className="text-primary">Parameters</span></CardTitle>
                <CardDescription className="text-white font-medium">Define your market acquisition zone</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white">Search Source</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant={searchType === "internal" ? "default" : "outline"}
                      className={cn(
                        "rounded-xl font-bold uppercase tracking-widest text-[10px] h-12",
                        searchType === "internal" ? "bg-primary" : "border-white/10 text-white hover:bg-white/5"
                      )}
                      onClick={() => setSearchType("internal")}
                    >
                      <DatabaseZap className="w-4 h-4 mr-2" />
                      Internal
                    </Button>
                    <Button 
                      variant={searchType !== "internal" ? "default" : "outline"}
                      className={cn(
                        "rounded-xl font-bold uppercase tracking-widest text-[10px] h-12",
                        searchType !== "internal" ? "bg-primary" : "border-white/10 text-white hover:bg-white/5"
                      )}
                      onClick={() => setSearchType("collision_center")}
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      External
                    </Button>
                  </div>
                </div>

                {searchType !== "internal" ? (
                  <>
                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white">Business Target</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {LEAD_TYPES.map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setSearchType(type.id)}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 gap-2",
                              searchType === type.id
                                ? "bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10"
                                : "bg-white/5 border-white/10 text-white hover:border-white/20 hover:bg-white/10"
                            )}
                          >
                            <type.icon className="w-5 h-5" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-center">{type.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white">Location Area</Label>
                      <div className="relative group">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within:scale-110 transition-transform" />
                        <Input 
                          placeholder="City, ZIP, or Address" 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="pl-12 bg-white/5 border-white/10 rounded-xl h-12 text-sm font-bold text-white placeholder:text-white focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white">Search Radius (Miles)</Label>
                      <div className="flex gap-2">
                        {RADIUS_OPTIONS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setRadius(r.toString())}
                            className={cn(
                              "flex-1 py-2 rounded-xl border text-[10px] font-black transition-all duration-300",
                              radius === r.toString()
                                ? "bg-primary border-primary text-white"
                                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                            )}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 text-primary">
                      <DatabaseZap className="w-5 h-5" />
                      <span className="font-black uppercase tracking-widest text-xs">Internal Intelligence</span>
                    </div>
                    <p className="text-xs text-white leading-relaxed">
                      AI will scan your database for inactive clients, unaccepted quotes, and maintenance-due opportunities to generate high-conversion leads.
                    </p>
                  </div>
                )}

                <Button 
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest shadow-glow-blue group relative overflow-hidden"
                  disabled={isGenerating}
                  onClick={searchType === "internal" ? handleGenerateInternal : handleGenerateExternal}
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{generationProgress > 0 ? `Qualifying... ${generationProgress}%` : "Generating..."}</span>
                    </div>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                      Generate Leads
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results Display */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">
                  Market <span className="text-primary">Intelligence</span> Results
                </h3>
                <Badge className="bg-white/5 text-white border-white/10 font-bold uppercase tracking-widest text-[9px]">
                  {generatedLeads.length} Potential Opportunities
                </Badge>
              </div>

              {generatedLeads.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AnimatePresence mode="popLayout">
                    {generatedLeads.map((lead, idx) => (
                      <motion.div
                        key={`${lead.name}-${lead.address}-${idx}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        <Card className="bg-white/5 border-white/10 rounded-3xl overflow-hidden hover:border-primary/50 transition-all duration-500 group relative">
                          <div className="absolute top-0 right-0 p-4">
                            <div className="flex flex-col items-end gap-2">
                              <Badge className={cn(
                                "font-black uppercase tracking-widest text-[8px] px-2 py-0.5",
                                lead.aiScore > 90 ? "bg-green-500/20 text-green-500 border-green-500/20" :
                                lead.aiScore > 80 ? "bg-primary/20 text-primary border-primary/20" :
                                "bg-yellow-500/20 text-yellow-500 border-yellow-500/20"
                              )}>
                                Score: {lead.aiScore}
                              </Badge>
                              <Badge className={cn(
                                "font-black uppercase tracking-widest text-[8px] px-2 py-0.5",
                                lead.aiClassification === "High Value Client" ? "bg-green-500/20 text-green-500 border-green-500/20" :
                                lead.aiClassification === "Reactivation Lead" ? "bg-purple-500/20 text-purple-500 border-purple-500/20" :
                                lead.aiClassification === "Collision Center" ? "bg-orange-500/20 text-orange-500 border-orange-500/20" :
                                lead.aiClassification === "Dealership" ? "bg-[#0A4DFF]/20 text-[#0A4DFF] border-[#0A4DFF]/20" :
                                lead.aiClassification === "Fleet" ? "bg-[#0A4DFF]/20 text-[#0A4DFF] border-[#0A4DFF]/20" :
                                lead.aiClassification === "Commercial Account" ? "bg-amber-500/20 text-amber-500 border-amber-500/20" :
                                lead.aiClassification === "Retail Client" ? "bg-[#0A4DFF]/20 text-[#0A4DFF] border-[#0A4DFF]/20" :
                                "bg-white/10 text-white border-white/10"
                              )}>
                                {lead.aiClassification}
                              </Badge>
                            </div>
                          </div>
                          
                          <CardHeader className="p-6 pb-2">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                                {lead.isInternal ? <DatabaseZap className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                              </div>
                              <div>
                                <CardTitle className="text-base font-black uppercase tracking-tighter text-white truncate max-w-[180px]">
                                  {lead.name}
                                </CardTitle>
                                <p className="text-[9px] text-white font-bold uppercase tracking-widest flex items-center gap-1">
                                  <MapPin className="w-2 h-2" />
                                  {lead.address?.split(',')[0]}
                                </p>
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="p-6 pt-2 space-y-4">
                            <div className="p-3 bg-black/40 rounded-2xl border border-white/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-widest text-white">Value Estimate</span>
                                <span className="text-xs font-black text-green-500">${lead.aiValueEstimate}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-widest text-white">Next Action</span>
                                <span className="text-[9px] font-bold text-primary italic">{lead.aiRecommendedAction}</span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button 
                                variant="outline"
                                className="flex-1 rounded-xl border-white/10 text-white hover:bg-white/5 font-bold uppercase tracking-widest text-[9px] h-10"
                                onClick={() => setSelectedLead(lead)}
                              >
                                <MessageSquare className="w-3 h-3 mr-2" />
                                Outreach
                              </Button>
                              <Button 
                                className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest text-[9px] h-10"
                                onClick={() => handleImportLead(lead)}
                              >
                                <Plus className="w-3 h-3 mr-2" />
                                Add Lead
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-20 bg-white/5 border border-dashed border-white/10 rounded-[3rem] text-center space-y-6">
                  <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-white">
                    <Search className="w-10 h-10" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter text-white">No Results <span className="text-primary italic">Found</span></h4>
                    <p className="text-sm text-white font-medium mt-2 max-w-xs mx-auto">
                      Adjust your parameters and run the engine to acquire new market opportunities.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="outline-none">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {["new", "contacted", "quoted", "reactivation", "maintenance_due"].map((status) => (
              <div key={status} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      status === "new" ? "bg-[#0A4DFF]" :
                      status === "contacted" ? "bg-yellow-500" :
                      status === "quoted" ? "bg-primary" :
                      "bg-purple-500"
                    )} />
                    {status.replace('_', ' ')}
                  </h4>
                  <Badge className="bg-white/5 text-white border-white/10 text-[8px] font-black">
                    {pipelineLeads.filter(l => l.status === status).length}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {pipelineLeads.filter(l => l.status === status).map((lead) => (
                    <Card 
                      key={lead.id} 
                      className="bg-white/5 border-white/10 rounded-2xl p-4 hover:border-primary/30 transition-all cursor-pointer group"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-white truncate max-w-[120px]">{lead.name}</span>
                        {lead.aiScore && (
                          <span className="text-[8px] font-black text-primary">{lead.aiScore}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-white font-bold uppercase tracking-widest">{lead.source?.split(':')[0] || "Direct"}</span>
                        <ChevronRight className="w-3 h-3 text-white group-hover:text-primary transition-colors" />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="intelligence" className="outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-white/5 border-white/10 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">Conversion <span className="text-primary">Insights</span></h3>
                <p className="text-xs text-white font-medium mt-1 uppercase tracking-widest">Lead Performance Analysis</p>
              </div>
              <div className="space-y-4">
                {intelligenceMetrics.conversionInsights.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">{stat.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">{stat.rate}</span>
                      {stat.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingUp className="w-3 h-3 text-red-500 rotate-180" />}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-[#0A4DFF]/10 flex items-center justify-center text-[#0A4DFF]">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">Market <span className="text-blue-500">Saturation</span></h3>
                <p className="text-xs text-white font-medium mt-1 uppercase tracking-widest">Regional Opportunity Map</p>
              </div>
              <div className="space-y-4">
                {intelligenceMetrics.marketSaturation.map((area) => (
                  <div key={area.label} className="space-y-2">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                      <span className="text-white">{area.label}</span>
                      <span className="text-white">{area.level}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-1000", area.color)} style={{ width: `${area.level}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-white/5 border-white/10 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">Strategic <span className="text-purple-500">Targets</span></h3>
                <p className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-widest">High-Value Acquisition Goals</p>
              </div>
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
                <p className="text-[10px] text-purple-300 font-bold leading-relaxed italic">
                  "{intelligenceMetrics.strategicTarget}"
                </p>
              </div>
              <Button 
                variant="outline" 
                className="w-full rounded-xl border-purple-500/20 text-purple-400 hover:bg-purple-500/10 font-black uppercase tracking-widest text-[10px] h-12"
                onClick={() => setShowMarketReport(true)}
              >
                View Full Market Report
              </Button>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Market Report Dialog */}
      <Dialog open={showMarketReport} onOpenChange={setShowMarketReport}>
        <DialogContent className="max-w-4xl bg-card border-none p-0 overflow-hidden rounded-[2rem] shadow-2xl shadow-black flex flex-col max-h-[90vh]">
          <DialogHeader className="p-8 bg-black/40 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">Full Market <span className="text-purple-500">Intelligence</span> Report</DialogTitle>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Strategic Acquisition Protocol v4.2</p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white/5 border-white/10 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Market Reach</p>
                <p className="text-3xl font-black text-white">{clients.length + pipelineLeads.length}</p>
                <p className="text-[9px] text-purple-400 font-bold uppercase mt-1">Active + Potential Targets</p>
              </Card>
              <Card className="bg-white/5 border-white/10 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">High-Value Density</p>
                <p className="text-3xl font-black text-white">
                  {pipelineLeads.filter(l => l.aiScore && l.aiScore > 80).length}
                </p>
                <p className="text-[9px] text-green-400 font-bold uppercase mt-1">Qualified Hot Leads</p>
              </Card>
              <Card className="bg-white/5 border-white/10 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Market Share</p>
                <p className="text-3xl font-black text-white">
                  {Math.round((clients.length / (clients.length + pipelineLeads.length || 1)) * 100)}%
                </p>
                <p className="text-[9px] text-[#0A4DFF] font-bold uppercase mt-1">Conversion Efficiency</p>
              </Card>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-black text-white uppercase tracking-tight">Regional Saturation Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {intelligenceMetrics.marketSaturation.map((area) => (
                  <div key={area.label} className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-white uppercase">{area.label}</span>
                      <span className="text-[10px] font-black text-primary">{area.level}%</span>
                    </div>
                    <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", area.color)} style={{ width: `${area.level}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-black text-white uppercase tracking-tight">Strategic Recommendations</h4>
              <div className="p-6 bg-purple-500/5 border border-purple-500/20 rounded-3xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-500 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {intelligenceMetrics.strategicTarget}
                  </p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-[#0A4DFF]/20 flex items-center justify-center text-[#0A4DFF] shrink-0">
                    <Target className="w-4 h-4" />
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Market data suggests a {radius} mile radius expansion around {location || "base operations"} could yield a 15-20% increase in high-value commercial leads.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-black/40 border-t border-white/5 flex justify-end">
            <Button 
              className="bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl border border-white/10"
              onClick={() => setShowMarketReport(false)}
            >
              Close Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Outreach Modal */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-2xl bg-sidebar border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 bg-black/40 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-white italic">AI <span className="text-primary">Outreach</span></h2>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Strategic Communication for {selectedLead.name}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedLead(null)} className="text-gray-500 hover:text-white rounded-xl">
                  <XCircle className="w-6 h-6" />
                </Button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {selectedLead.aiOutreachDrafts ? (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                          <Zap className="w-3 h-3 text-primary" />
                          SMS Outreach
                        </Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5"
                          onClick={() => copyToClipboard(selectedLead.aiOutreachDrafts?.sms || "", "sms")}
                        >
                          {copiedType === "sms" ? <Check className="w-3 h-3 mr-2" /> : <Copy className="w-3 h-3 mr-2" />}
                          Copy SMS
                        </Button>
                      </div>
                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-gray-300 leading-relaxed italic">
                        "{selectedLead.aiOutreachDrafts.sms}"
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                          <Mail className="w-3 h-3 text-[#0A4DFF]" />
                          Email Outreach
                        </Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[9px] font-black uppercase tracking-widest text-[#0A4DFF] hover:bg-[#0A4DFF]/5"
                          onClick={() => copyToClipboard(selectedLead.aiOutreachDrafts?.email || "", "email")}
                        >
                          {copiedType === "email" ? <Check className="w-3 h-3 mr-2" /> : <Copy className="w-3 h-3 mr-2" />}
                          Copy Email
                        </Button>
                      </div>
                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-gray-300 whitespace-pre-wrap leading-relaxed italic">
                        {selectedLead.aiOutreachDrafts.email}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                          <Phone className="w-3 h-3 text-green-500" />
                          Call Script
                        </Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[9px] font-black uppercase tracking-widest text-green-500 hover:bg-green-500/5"
                          onClick={() => copyToClipboard(selectedLead.aiOutreachDrafts?.callScript || "", "call")}
                        >
                          {copiedType === "call" ? <Check className="w-3 h-3 mr-2" /> : <Copy className="w-3 h-3 mr-2" />}
                          Copy Script
                        </Button>
                      </div>
                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-gray-300 leading-relaxed italic">
                        "{selectedLead.aiOutreachDrafts.callScript}"
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-yellow-500" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-white font-black uppercase tracking-tight">Intelligence Missing</p>
                      <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">
                        This lead hasn't been processed by the AI engine yet. Generate intelligence to unlock strategic outreach.
                      </p>
                    </div>
                    <Button 
                      className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-xl"
                      onClick={() => handleGenerateIntelligence(selectedLead)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate AI Intelligence"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-white/5 bg-black/40 flex gap-4">
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 rounded-xl border-white/10 text-gray-400 hover:bg-white/5 font-black uppercase tracking-widest text-xs"
                  onClick={() => setSelectedLead(null)}
                >
                  Close
                </Button>
                <Button 
                  className="flex-1 h-12 rounded-xl bg-primary hover:bg-[#2A6CFF] text-white font-black uppercase tracking-widest text-xs shadow-glow-blue"
                  onClick={() => {
                    if (selectedLead.id) {
                      updateDoc(doc(db, "leads", selectedLead.id), { status: "contacted" });
                      toast.success("Status updated to Contacted");
                    }
                    setSelectedLead(null);
                  }}
                >
                  Mark as Contacted
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

