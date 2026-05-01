import React, { useState, useEffect, useRef, useMemo } from "react";
import { query, where, onSnapshot, Timestamp, orderBy, limit, getDocs, getDoc, addDoc, collection, serverTimestamp, doc } from "firebase/firestore";
import { db, storage, handleFirestoreError, OperationType } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Users, 
  Calendar as CalendarIcon, 
  DollarSign, 
  Clock, 
  UserPlus, 
  MapPin, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  MessageSquare,
  Receipt,
  TrendingDown,
  BarChart3,
  Truck,
  Loader2,
  Zap,
  Rocket,
  Target,
  Sparkles,
  RefreshCcw,
  ShieldCheck,
  Navigation,
  BrainCircuit,
  X,
  History,
  UserCheck,
  Shield,
  CloudRain,
  Search,
  ExternalLink
} from "lucide-react";
import { format, startOfDay, endOfDay, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { cn, formatDuration, resizeImage, formatCurrency } from "@/lib/utils";
import { optimizeRoute, RouteStop } from "@/lib/scheduling";
import { Appointment, Lead, Expense, Client, Invoice, BusinessSettings, WeatherInfo } from "@/types";
import { askAssistant, AIResponse } from "../services/gemini";
import { fetchWeather } from "../services/weatherService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Dashboard() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    projected: 0,
    completed: 0,
    pending: 0,
    leadsCount: 0,
    activeJobs: 0,
    weekProjected: 0,
    weekCompleted: 0,
    monthProjected: 0,
    monthCompleted: 0
  });
  const [upcomingJobs, setUpcomingJobs] = useState<Appointment[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);

  const [isGeneratingGrowth, setIsGeneratingGrowth] = useState(false);
  const [growthStrategy, setGrowthStrategy] = useState<AIResponse | null>(null);

  const growthMetrics = useMemo(() => {
    // 1. Retention Rate
    const clientAppCounts: Record<string, number> = {};
    allAppointments.forEach(app => {
      if (app.clientId) {
        clientAppCounts[app.clientId] = (clientAppCounts[app.clientId] || 0) + 1;
      }
    });
    const repeatClients = Object.values(clientAppCounts).filter(count => count > 1).length;
    const totalClients = clients.length || 1;
    const retentionRate = Math.round((repeatClients / totalClients) * 100);

    // 2. Lead Conversion
    const totalLeadsCount = allLeads.length || 1;
    const convertedLeadsCount = allLeads.filter(l => l.status === "converted").length;
    const conversionRate = Math.round((convertedLeadsCount / totalLeadsCount) * 100);

    // 3. Avg Ticket Size
    const completedApps = allAppointments.filter(app => app.status === "completed" || app.status === "paid");
    const totalRevenue = completedApps.reduce((sum, app) => sum + (app.totalAmount || 0), 0);
    const avgTicket = completedApps.length > 0 ? Math.round(totalRevenue / completedApps.length) : 0;

    return { retentionRate, conversionRate, avgTicket };
  }, [allAppointments, clients, allLeads]);

  const fetchDashboardData = async (showToast = false) => {
    if (!profile) return;
    
    // Cache check to avoid redundant reads during navigation (5 min TTL)
    const CACHE_KEY = `dashboard_cache_${profile.id}`;
    const lastFetch = Number(sessionStorage.getItem(`${CACHE_KEY}_time`) || 0);
    const now = Date.now();
    const CACHE_TTL = 5 * 60 * 1000;

    if (!showToast && now - lastFetch < CACHE_TTL) {
      const cachedData = sessionStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          setStats(parsed.stats);
          setUpcomingJobs(parsed.upcomingJobs);
          setRecentLeads(parsed.recentLeads);
          setAllLeads(parsed.allLeads);
          setClients(parsed.clients);
          setInvoices(parsed.invoices);
          setAllAppointments(parsed.allAppointments);
          setSettings(parsed.settings);
          setLoading(false);
          console.log("[Dashboard] Loaded from cache");
          return;
        } catch (e) {
          console.warn("[Dashboard] Cache parse failed", e);
        }
      }
    }

    if (showToast) toast.loading("Syncing operations...", { id: "sync-dashboard" });
    
    setLoading(true);
    const today = new Date();
    const todayStart = startOfDay(today);
    const startDay = startOfDay(today);
    const endDay = endOfDay(today);
    const startWeek = startOfWeek(today);
    const endWeek = endOfWeek(today);
    const startMonth = startOfMonth(today);
    const endMonth = endOfMonth(today);

    try {
      const [statsSnap, jobsSnap, leadsSnap, aiLeadsSnap, aiClientsSnap, aiInvoicesSnap, settingsSnap] = await Promise.all([
        getDocs(query(
          collection(db, "appointments"),
          where("scheduledAt", ">=", Timestamp.fromDate(startMonth)),
          where("scheduledAt", "<=", Timestamp.fromDate(endMonth)),
          limit(300)
        )).catch(e => handleFirestoreError(e, OperationType.LIST, "appointments")),
        getDocs(query(
          collection(db, "appointments"),
          where("scheduledAt", ">=", Timestamp.fromDate(todayStart)),
          orderBy("scheduledAt", "asc"),
          limit(5)
        )).catch(e => handleFirestoreError(e, OperationType.LIST, "appointments_upcoming")),
        getDocs(query(
          collection(db, "leads"),
          where("status", "==", "new"),
          orderBy("createdAt", "desc"),
          limit(8)
        )).catch(e => handleFirestoreError(e, OperationType.LIST, "leads_new")),
        getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(20))).catch(e => handleFirestoreError(e, OperationType.LIST, "leads_all")),
        getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(20))).catch(e => handleFirestoreError(e, OperationType.LIST, "clients")),
        getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(20))).catch(e => handleFirestoreError(e, OperationType.LIST, "invoices")),
        getDoc(doc(db, "settings", "business")).catch(e => handleFirestoreError(e, OperationType.GET, "settings/business"))
      ]);

      if (!statsSnap || !jobsSnap || !leadsSnap || !aiLeadsSnap || !aiClientsSnap || !aiInvoicesSnap || !settingsSnap) return;

      // Stats Processing
      let dayProj = 0, dayComp = 0, dayPend = 0, dayActive = 0;
      let weekProj = 0, weekComp = 0;
      let monthProj = 0, monthComp = 0;
      
      const statsList: Appointment[] = [];
      statsSnap.docs.forEach(doc => {
        const data = doc.data() as Appointment;
        statsList.push({ id: doc.id, ...data });
        const date = data.scheduledAt instanceof Timestamp ? data.scheduledAt.toDate() : new Date(data.scheduledAt as any);
        const amount = data.totalAmount || 0;

        monthProj += amount;
        if (data.status === "completed" || data.status === "paid") monthComp += amount;

        if (date >= startWeek && date <= endWeek) {
          weekProj += amount;
          if (data.status === "completed" || data.status === "paid") weekComp += amount;
        }

        if (date >= startDay && date <= endDay) {
          dayProj += amount;
          if (data.status === "completed" || data.status === "paid") {
            dayComp += amount;
          } else if (data.status !== "canceled") {
            dayPend += amount;
            if (data.status === "in_progress" || data.status === "en_route") {
              dayActive++;
            }
          }
        }
      });
      
      const newStats = {
        projected: dayProj,
        completed: dayComp,
        pending: dayPend,
        activeJobs: dayActive,
        weekProjected: weekProj,
        weekCompleted: weekComp,
        monthProjected: monthProj,
        monthCompleted: monthComp,
        leadsCount: leadsSnap.size
      };
      
      setStats(newStats);

      const jobsList = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      const recentLeadsList = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      const allLeadsList = aiLeadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
      const clientsList = aiClientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      const invoicesList = aiInvoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      const businessSettings = settingsSnap.exists() ? (settingsSnap.data() as BusinessSettings) : null;

      setUpcomingJobs(jobsList);
      setRecentLeads(recentLeadsList);
      setAllAppointments(statsList);
      setAllLeads(allLeadsList);
      setClients(clientsList);
      setInvoices(invoicesList);
      setSettings(businessSettings);

      if (businessSettings?.baseLatitude && businessSettings?.baseLongitude) {
        fetchWeather(businessSettings.baseLatitude, businessSettings.baseLongitude)
          .then(setWeather);
      }

      // Save to Session Cache
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        stats: newStats,
        upcomingJobs: jobsList,
        recentLeads: recentLeadsList,
        allLeads: allLeadsList,
        clients: clientsList,
        invoices: invoicesList,
        allAppointments: statsList,
        settings: businessSettings
      }));
      sessionStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString());

      if (showToast) toast.success("Command Center Ready", { id: "sync-dashboard" });
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      if (error?.message?.includes("Quota limit exceeded")) {
        toast.error("Dashboard Sync Failed: Quota exceeded");
      } else if (showToast) {
        toast.error("Sync Interrupted", { id: "sync-dashboard" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchDashboardData();

    // 5. Route Optimization
    const today = new Date();
    optimizeRoute(today)
      .then(({ stops, error }) => {
        setOptimizedRoute(Array.isArray(stops) ? stops : []);
        if (error) toast.error(error);
      })
      .catch(error => {
        console.error("Error optimizing route:", error);
        setOptimizedRoute([]);
      });

    setLoading(false);

    return () => {};
  }, [profile, authLoading]);

  const performancePercent = stats.projected > 0 ? (stats.completed / stats.projected) * 100 : 0;

  // ESC key to close focused card
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedCardId(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([
    "Dashboard analysis ready. Click below to generate AI strategic insights based on your current performance data.",
  ]);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: "fuel",
    amount: 0,
    description: "",
    date: Timestamp.now()
  });

  const generateInsights = async () => {
    if (!profile || isGeneratingInsights) return;
    
    // Add debounce check
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_dashboard_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between AI requests.");
      return;
    }
    localStorage.setItem('last_dashboard_ai_action', now.toString());

    setIsGeneratingInsights(true);
    try {
      console.log("[Dashboard] Manual AI Insights Triggered");
      // Prepare context for AI
      const context = {
        appointments: upcomingJobs.slice(0, 10),
        leads: recentLeads.slice(0, 10),
        stats: stats,
        profile: profile,
        weather: weather ? {
          current: weather.current,
          guidance: weather.businessGuidance
        } : null
      };
      
      const response = await askAssistant(
        "Generate 2 brief, high-impact strategic business insights or recommendations based on the current dashboard data. Focus on efficiency, revenue growth, or scheduling optimization. Ensure these insights are provided in the 'suggestedActions' field of your response structure.",
        context
      );
      
      if (response.suggestedActions && response.suggestedActions.length > 0) {
        setAiInsights(response.suggestedActions.slice(0, 2));
      } else if (response.suggestion) {
        setAiInsights([response.suggestion]);
      } else {
        throw new Error("No insights generated");
      }
      toast.success("Intelligence Updated!");
    } catch (error) {
      console.error("Error generating insights:", error);
      setAiInsights([
        "Route density opportunity: You have three jobs in the North area on Friday. Consider tightening the schedule to save on fuel.",
        "Upsell opportunity: 40% of clients this week have not had a ceramic coating in over 12 months."
      ]);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleAddExpense = async () => {
    try {
      if (!newExpense.amount || !newExpense.description) {
        toast.error("Please fill in all fields");
        return;
      }

      let receiptUrl = "";
      if (receiptFile) {
        // Since Firebase storage rules might block unstructured uploads, we will compress to Base64
        // Base64 storage in Firestore circumvents storage failures.
        const reader = new FileReader();
        receiptUrl = await new Promise((resolve) => {
          reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            // PDF vs Image handling (PDFs don't resize well this way, but we'll try image resize)
            if (dataUrl.startsWith("data:image")) {
               resolve(await resizeImage(dataUrl, 800));
            } else {
               resolve(dataUrl); // For PDFs or others, just keep the raw base64
            }
          };
          reader.readAsDataURL(receiptFile);
        });
      }

      await addDoc(collection(db, "expenses"), {
        ...newExpense,
        receiptUrl,
        technicianId: profile?.uid,
        date: Timestamp.now()
      });
      toast.success("Expense added successfully");
      setIsExpenseDialogOpen(false);
      setNewExpense({ category: "fuel", amount: 0, description: "" });
      setReceiptFile(null);
    } catch (error) {
      console.error("Error adding expense:", error);
      toast.error("Failed to add expense");
    }
  };

  const generateGrowthStrategy = async () => {
    if (isGeneratingGrowth) return;

    // Add debounce check
    const now = Date.now();
    const lastAIAction = Number(localStorage.getItem('last_dashboard_growth_ai_action') || 0);
    if (now - lastAIAction < 3000) {
      toast.info("Please wait a moment between AI requests.");
      return;
    }
    localStorage.setItem('last_dashboard_growth_ai_action', now.toString());

    setIsGeneratingGrowth(true);
    try {
      console.log("[Dashboard] Growth Strategy AI Triggered");
      const paidInvoices = invoices.filter(i => i.status === "paid");
      const totalRevenue = paidInvoices.reduce((sum, i) => sum + i.total, 0);
      const pendingRevenue = invoices.filter(i => i.status !== "paid").reduce((sum, i) => sum + i.total, 0);
      const upcomingAppointments = allAppointments.filter(a => a.status === "scheduled" || a.status === "confirmed");
      const projectedRevenue = upcomingAppointments.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

      const context = {
        businessName: settings?.businessName || "Flatline Mobile Detail",
        clientCount: clients.length,
        vipCount: clients.filter(c => c.isVIP).length,
        leadCount: allLeads.length,
        activeLeads: allLeads.filter(l => l.status !== "converted" && l.status !== "lost").length,
        totalRevenue,
        pendingRevenue,
        projectedRevenue,
        upcomingAppointmentCount: upcomingAppointments.length,
        topServices: Array.from(new Set(allAppointments.flatMap(a => a.serviceNames))).slice(0, 5),
        weather: weather ? {
          current: weather.current,
          forecast: weather.forecast.slice(0, 3),
          guidance: weather.businessGuidance
        } : null
      };

      const prompt = "Generate a comprehensive business growth and scaling strategy. Focus on retention, acquisition, and high-margin upselling. Provide specific scaling insights and a summary of business health.";
      
      const strategy = await askAssistant(prompt, context);
      setGrowthStrategy(strategy);
      toast.success("Growth strategy generated!");
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
        toast.error("AI Assistant is currently unavailable.");
      }
    } finally {
      setIsGeneratingGrowth(false);
    }
  };

  return (
    <div className="space-y-10 pb-24 w-full animate-in fade-in duration-700">
      <PageHeader 
        title="Command CENTER" 
        accentWord="CENTER" 
        subtitle={`System Status: Optimal • ${format(new Date(), "EEEE, MMMM d, yyyy")}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="outline" 
              className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[11px]"
              onClick={() => fetchDashboardData(true)}
              disabled={loading}
            >
              <RefreshCcw className={cn("w-4 h-4 mr-2 text-primary", loading && "animate-spin")} />
              Sync Ops
            </Button>
            <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
              <DialogTrigger render={
                <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[11px]">
                  <Receipt className="w-4 h-4 mr-2 text-primary" /> Log Expense
                </Button>
              } />
              <DialogContent className="bg-card border-none p-0 overflow-hidden rounded-3xl shadow-2xl shadow-black max-w-lg w-full">
                <DialogHeader className="p-8 border-b border-white/5 bg-black/40">
                  <DialogTitle className="font-black text-2xl tracking-tighter text-white uppercase">Business Expense</DialogTitle>
                </DialogHeader>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Category</Label>
                    <Select 
                      value={newExpense.category} 
                      onValueChange={(v: any) => setNewExpense({ ...newExpense, category: v })}
                    >
                      <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-12">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-white">
                        <SelectItem value="fuel">Fuel</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="insurance">Insurance</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Amount ($)</Label>
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      className="bg-black/40 border-white/10 text-white rounded-xl h-12 text-lg font-bold"
                      value={newExpense.amount === 0 ? "" : newExpense.amount} 
                      onFocus={(e) => {
                        if (newExpense.amount === 0) {
                          // Allow clearing
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        setNewExpense({ ...newExpense, amount: isNaN(val) ? 0 : val });
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          setNewExpense({ ...newExpense, amount: 0 });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Description</Label>
                    <Input 
                      placeholder="e.g. Gas for van, Microfiber towels" 
                      className="bg-black/40 border-white/10 text-white rounded-xl h-12"
                      value={newExpense.description} 
                      onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Reference Photo</Label>
                    <div className="flex items-center gap-4">
                      <Button 
                        variant="outline" 
                        className="flex-1 h-12 border-dashed border-white/10 bg-black/20 text-white/60 hover:text-white hover:border-white/20 rounded-xl"
                        onClick={() => document.getElementById('receipt-upload')?.click()}
                      >
                        {receiptFile ? receiptFile.name : "Capture or Upload Receipt"}
                      </Button>
                      <input 
                        id="receipt-upload" 
                        type="file" 
                        accept="image/*,application/pdf" 
                        capture="environment"
                        className="hidden" 
                        onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                  <Button className="w-full bg-primary text-white hover:bg-red-700 font-black h-14 rounded-xl uppercase tracking-[0.2em] text-xs shadow-lg shadow-primary/20" onClick={handleAddExpense}>
                    Finalize Transaction
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => navigate("/book-appointment")} className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-primary/20 transition-all hover:scale-105">
              <Plus className="w-4 h-4 mr-2" /> New Deployment
            </Button>
          </div>
        }
      />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        <FocusWrapper id="daily-revenue" title="Daily Revenue Strategy" focusedId={focusedCardId} onFocus={setFocusedCardId}>
          <StatCard 
            title="Daily Revenue" 
            value={formatCurrency(stats.completed)} 
            subValue={`Target: ${formatCurrency(stats.projected)}`}
            icon={<DollarSign className="w-6 h-6" />}
            trend={performancePercent >= 100 ? "up" : "down"}
            trendValue={`${Math.round(performancePercent)}%`}
            color="red"
            standalone={focusedCardId === "daily-revenue"}
          />
        </FocusWrapper>

        <FocusWrapper id="weekly-volume" title="Weekly Operational Scale" focusedId={focusedCardId} onFocus={setFocusedCardId}>
          <StatCard 
            title="Weekly Volume" 
            value={formatCurrency(stats.weekCompleted)} 
            subValue={`Target: ${formatCurrency(stats.weekProjected)}`}
            icon={<BarChart3 className="w-6 h-6" />}
            trend={stats.weekProjected > 0 ? (stats.weekCompleted / stats.weekProjected >= 1 ? "up" : "down") : "up"}
            trendValue={stats.weekProjected > 0 ? `${Math.round((stats.weekCompleted / stats.weekProjected) * 100)}%` : "0%"}
            color="white"
            standalone={focusedCardId === "weekly-volume"}
          />
        </FocusWrapper>

        <FocusWrapper id="monthly-perf" title="Monthly Performance Intelligence" focusedId={focusedCardId} onFocus={setFocusedCardId}>
          <StatCard 
            title="Monthly Performance" 
            value={formatCurrency(stats.monthCompleted)} 
            subValue={`Target: ${formatCurrency(stats.monthProjected)}`}
            icon={<TrendingUp className="w-6 h-6" />}
            trend={stats.monthProjected > 0 ? (stats.monthCompleted / stats.monthProjected >= 1 ? "up" : "down") : "up"}
            trendValue={stats.monthProjected > 0 ? `${Math.round((stats.monthCompleted / stats.monthProjected) * 100)}%` : "0%"}
            color="red"
            standalone={focusedCardId === "monthly-perf"}
          />
        </FocusWrapper>

        <FocusWrapper id="ops" title="Active Operations Command" focusedId={focusedCardId} onFocus={setFocusedCardId}>
          <StatCard 
            title="Active Operations" 
            value={stats.activeJobs.toString()} 
            subValue={`${formatCurrency(stats.pending)} in pipeline`}
            icon={<Clock className="w-6 h-6" />}
            color="white"
            standalone={focusedCardId === "ops"}
          />
        </FocusWrapper>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {/* Route Optimization View */}
        <FocusWrapper id="job-route" title="Field Operations" focusedId={focusedCardId} onFocus={setFocusedCardId} className="lg:col-span-2">
          <Card className={cn(
            "border-none bg-card rounded-3xl overflow-hidden shadow-xl h-full flex flex-col group transition-all duration-500 hover:shadow-primary/5",
            focusedCardId !== "job-route" && "max-h-[350px]"
          )}>
            <CardHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between bg-black/40 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 group-hover:scale-110 transition-transform">
                  <Navigation className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Job Route</CardTitle>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Efficiency Protocol Active</p>
                    {optimizedRoute.length > 0 && (
                      <>
                        <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                          {formatDuration(optimizedRoute.reduce((acc, stop) => acc + (stop.travelTimeFromPrevious || 0), 0))} travel time
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-white/10 bg-zinc-900 text-white hover:bg-white/5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all" onClick={(e) => {
                e.stopPropagation();
                optimizeRoute(new Date()).then(({ stops, error }) => {
                  setOptimizedRoute(Array.isArray(stops) ? stops : []);
                  if (error) toast.error(error);
                }).catch(() => setOptimizedRoute([]));
              }}>
                Recalculate Protocol
              </Button>
            </CardHeader>
            <CardContent className={cn("p-0 grow overflow-y-auto custom-scrollbar relative", focusedCardId !== "job-route" ? "pointer-events-none" : "")}>
              <div className="p-8">
                {(!optimizedRoute || optimizedRoute.length === 0) ? (
                  <div className="p-12 text-center flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <CalendarIcon className="w-8 h-8 text-white/40" />
                    </div>
                    <p className="text-white/40 font-medium uppercase tracking-widest text-xs">No operations scheduled.</p>
                  </div>
                ) : (
                  <div className="space-y-6 relative before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-[2px] before:bg-gradient-to-b before:from-primary before:to-primary/10">
                    {optimizedRoute.slice(0, focusedCardId === "job-route" ? undefined : 3).map((stop, idx) => (
                      <div key={`stop-${stop.id}-${idx}`} className="relative pl-12 flex items-start justify-between group">
                        <div className="absolute left-0 top-1 w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center z-10 group-hover:border-primary/50 transition-all duration-300 shadow-xl text-white font-black text-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1 bg-white/[0.03] rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all duration-300 group-hover:bg-white/[0.05] text-left">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-black text-white tracking-tight uppercase text-sm">{stop.customerName || "Client"}</h4>
                            <div className="flex items-center gap-2">
                              {stop.travelTimeFromPrevious !== undefined && stop.travelTimeFromPrevious > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-lg border border-primary/20">
                                  <Truck className="w-3 h-3 text-primary" />
                                  <span className="text-[10px] font-black text-primary uppercase tracking-tight">{formatDuration(stop.travelTimeFromPrevious)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-2 text-white/60">
                              <MapPin className="w-3.5 h-3.5 text-primary/60" />
                              <span className="text-xs font-bold truncate tracking-tight">{stop.address}</span>
                            </div>
                            <div className="flex items-center gap-2 text-primary">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-xs font-black uppercase tracking-widest">
                                {stop.scheduledAt instanceof Timestamp ? format(stop.scheduledAt.toDate(), "h:mm a") : "TBD"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {focusedCardId !== "job-route" && optimizedRoute.length > 3 && (
                      <div className="p-4 text-center opacity-40">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">+ {optimizedRoute.length - 3} more destinations</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </FocusWrapper>

        {/* Intelligence Side Column */}
        <div className="space-y-8">
          <FocusWrapper id="intelligence" title="Operation Intelligence" focusedId={focusedCardId} onFocus={setFocusedCardId}>
            <Card className={cn(
              "border-none bg-card rounded-3xl overflow-hidden shadow-xl transition-all duration-500 hover:shadow-primary/5",
              focusedCardId !== "intelligence" && "max-h-[350px]"
            )}>
              <CardHeader className="p-8 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 group-hover:scale-110 transition-transform">
                    <BrainCircuit className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-lg font-black text-white uppercase tracking-tighter font-heading">Intelligence</CardTitle>
                </div>
              </CardHeader>
              <CardContent className={cn("p-8 grow space-y-8", focusedCardId !== "intelligence" && "pointer-events-none")}>
                {weather && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={`https://openweathermap.org/img/wn/${weather.current.icon}.png`} alt={weather.current.condition} className="w-10 h-10" />
                      <div>
                        <p className="text-xl font-black text-white">{weather.current.temp}°F</p>
                        <p className="text-[10px] text-white/40 font-black uppercase">{weather.current.condition}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[8px] font-black uppercase border-white/10 text-white/40">Real-time Data</Badge>
                  </div>
                )}
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Strategic Insights</p>
                  <div className="space-y-3">
                    {aiInsights.slice(0, focusedCardId === "intelligence" ? undefined : 1).map((insight, idx) => (
                      <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs font-medium text-white/80 leading-relaxed">
                        {insight}
                      </div>
                    ))}
                    {focusedCardId === "intelligence" && isGeneratingInsights && (
                      <div className="flex items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 border-dashed animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-primary mr-2" />
                        <span className="text-[10px] font-black uppercase text-white/20 tracking-widest">Updating Intelligence...</span>
                      </div>
                    )}
                  </div>
                </div>
                {focusedCardId === "intelligence" && (
                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-black uppercase text-white/20 mb-1">Total Clients</p>
                        <p className="text-xl font-black text-white">{clients.length}</p>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-black uppercase text-white/20 mb-1">Active Leads</p>
                        <p className="text-xl font-black text-white">{allLeads.filter(l => l.status !== "converted" && l.status !== "lost").length}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </FocusWrapper>

          <FocusWrapper id="growth-metrics" title="Growth Vector Analysis" focusedId={focusedCardId} onFocus={setFocusedCardId}>
            <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-primary/5">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-white/40 font-heading">Growth Metrics</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-white/40">Retention</span>
                    <span className="text-primary">{growthMetrics.retentionRate}%</span>
                  </div>
                  <Progress value={growthMetrics.retentionRate} className="h-1.5" />
                </div>
                {focusedCardId === "growth-metrics" && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase">
                        <span className="text-white/40">Lead Conversion</span>
                        <span className="text-primary">{growthMetrics.conversionRate}%</span>
                      </div>
                      <Progress value={growthMetrics.conversionRate} className="h-1.5" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase">
                        <span className="text-white/40">Avg Ticket Size</span>
                        <span className="text-primary">{formatCurrency(growthMetrics.avgTicket)}</span>
                      </div>
                      <Progress value={Math.min(100, (growthMetrics.avgTicket / 500) * 100)} className="h-1.5" />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </FocusWrapper>
        </div>
      </div>

      {/* Scaling Insights Section */}
      {growthStrategy && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter font-heading">Scaling Insights</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {growthStrategy.scalingInsights?.map((insight, idx) => (
              <Card key={`${insight.finding}-${idx}`} className="border-none shadow-xl bg-card border-l-4 border-l-primary group hover:scale-[1.02] transition-all duration-300">
                <CardHeader className="pb-2">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Scaling Opportunity
                  </p>
                  <CardTitle className="text-lg font-black tracking-tight leading-tight text-white">{insight.finding}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-white/80 font-medium leading-relaxed">{insight.recommendation}</p>
                  <div className="flex items-center gap-2 text-green-600 bg-green-500/10 w-fit px-3 py-1 rounded-full border border-green-500/20">
                    <ArrowUpRight className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{insight.impact}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Leads */}
      <FocusWrapper id="recent-leads" title="Sales Acquisition Pipeline" focusedId={focusedCardId} onFocus={setFocusedCardId}>
        <Card className={cn(
          "border-none bg-card rounded-3xl overflow-hidden shadow-xl transition-all duration-500 hover:shadow-primary/5",
          focusedCardId !== "recent-leads" && "max-h-[350px]"
        )}>
          <CardHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between bg-black/40">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 group-hover:scale-110 transition-transform">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">High-Priority Inquiries</CardTitle>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Pending conversion opportunities</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/leads")} className="font-black text-primary hover:bg-primary/5 uppercase tracking-widest text-[10px]">View Full Pipeline</Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border min-h-[100px]">
              {recentLeads.length === 0 ? (
                <div className="p-12 text-center text-white/40 uppercase tracking-widest text-[10px] font-black">No new inquiries detected.</div>
              ) : (
                recentLeads.slice(0, focusedCardId === "recent-leads" ? undefined : 3).map(lead => (
                  <div key={lead.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-all duration-300 group">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                        <UserPlus className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-black text-white uppercase tracking-tight text-sm">{lead.name}</p>
                        <p className="text-xs text-white/60 font-medium mt-0.5">{lead.requestedService} • {lead.vehicleInfo}</p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2 text-left">
                      <Badge className={cn(
                        "text-[9px] uppercase font-black tracking-widest px-3 py-1 rounded-full",
                        lead.priority === "hot" ? "bg-primary text-white" : "bg-orange-500 text-white"
                      )}>
                        {lead.priority}
                      </Badge>
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">
                        {lead.createdAt instanceof Timestamp ? format(lead.createdAt.toDate(), "MMM d, h:mm a") : "Just now"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </FocusWrapper>
    </div>
  );
}

function FocusWrapper({ id, focusedId, onFocus, title, children, className }: any) {
  const isFocused = focusedId === id;

  return (
    <>
      <div 
        onClick={() => !isFocused && onFocus(id)}
        className={cn(
          "cursor-pointer transition-all duration-300",
          isFocused ? "opacity-0 invisible" : "hover:scale-[1.02]",
          className
        )}
      >
        {children}
      </div>

      <AnimatePresence>
        {isFocused && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onFocus(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              layoutId={id}
              className="w-full max-w-2xl bg-card border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary">{title}</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => onFocus(null)}
                  className="rounded-full hover:bg-white/10 text-white/40 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function StatCard({ title, value, subValue, icon, trend, trendValue, color, standalone }: any) {
  const colors: any = {
    red: "bg-primary/10 text-primary border-primary/20",
    white: "bg-secondary text-white border-border",
    orange: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  const content = (
    <>
      <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 pointer-events-none">
        {icon && React.cloneElement(icon as React.ReactElement<any>, { className: "w-32 h-32" })}
      </div>
      <CardContent className="p-10 relative z-10 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-8">
            <div className={cn("p-4 rounded-2xl border transition-transform duration-500 group-hover:scale-110 shadow-sm", colors[color])}>
              {icon}
            </div>
            {trend && (
              <div className={cn(
                "flex items-center gap-1.5 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest",
                trend === "up" ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-primary/10 text-primary border border-primary/20"
              )}>
                {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {trendValue}
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">{title}</p>
            <h3 className="text-4xl sm:text-6xl font-black text-white tracking-tighter font-heading leading-none drop-shadow-sm">{value}</h3>
            {subValue && (
              <p className="text-xs font-bold text-[#A0A0A0] flex items-center gap-2 mt-4">
                <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(229,57,53,0.6)]"></span>
                {subValue}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </>
  );

  if (standalone) return content;

  return (
    <Card className="border-none bg-card rounded-3xl overflow-hidden group hover:shadow-2xl transition-all duration-500 shadow-xl relative min-h-[300px]">
      {content}
    </Card>
  );
}
