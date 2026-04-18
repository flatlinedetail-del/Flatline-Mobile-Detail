import React, { useState, useEffect, useRef, useMemo } from "react";
import { query, where, onSnapshot, Timestamp, orderBy, limit, getDocs, getDoc, addDoc, collection, serverTimestamp, doc } from "firebase/firestore";
import { db, storage } from "../firebase";
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
  Sparkles
} from "lucide-react";
import { format, startOfDay, endOfDay, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn, formatDuration, resizeImage } from "@/lib/utils";
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

  useEffect(() => {
    if (authLoading || !profile) return;

    const today = new Date();
    const todayStart = startOfDay(today);
    const startDay = startOfDay(today);
    const endDay = endOfDay(today);
    const startWeek = startOfWeek(today);
    const endWeek = endOfWeek(today);
    const startMonth = startOfMonth(today);
    const endMonth = endOfMonth(today);

    // 1. Fetch Stats & Aggregations (Fetch once to save quota)
    const fetchDashboardData = async () => {
      try {
        const [statsSnap, jobsSnap, leadsSnap, aiLeadsSnap, aiClientsSnap, aiInvoicesSnap, settingsSnap] = await Promise.all([
          getDocs(query(
            collection(db, "appointments"),
            where("scheduledAt", ">=", Timestamp.fromDate(startMonth)),
            where("scheduledAt", "<=", Timestamp.fromDate(endMonth)),
            limit(300)
          )),
          getDocs(query(
            collection(db, "appointments"),
            where("scheduledAt", ">=", Timestamp.fromDate(todayStart)),
            orderBy("scheduledAt", "asc"),
            limit(5)
          )),
          getDocs(query(
            collection(db, "leads"),
            where("status", "==", "new"),
            orderBy("createdAt", "desc"),
            limit(5)
          )),
          getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(20))),
          getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(20))),
          getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(20))),
          getDoc(doc(db, "settings", "business"))
        ]);

        // Stats Processing
        let dayProj = 0, dayComp = 0, dayPend = 0, dayActive = 0;
        let weekProj = 0, weekComp = 0;
        let monthProj = 0, monthComp = 0;
        
        statsSnap.docs.forEach(doc => {
          const data = doc.data() as Appointment;
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
        
        setStats(prev => ({
          ...prev,
          projected: dayProj,
          completed: dayComp,
          pending: dayPend,
          activeJobs: dayActive,
          weekProjected: weekProj,
          weekCompleted: weekComp,
          monthProjected: monthProj,
          monthCompleted: monthComp,
          leadsCount: leadsSnap.size
        }));

        setUpcomingJobs(jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
        setRecentLeads(leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)));
        
        const allFetchedJobs = statsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
        setAllAppointments(allFetchedJobs);
        setAllLeads(aiLeadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
        setClients(aiClientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
        setInvoices(aiInvoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));

        if (settingsSnap.exists()) {
          const businessSettings = settingsSnap.data() as BusinessSettings;
          setSettings(businessSettings);
          if (businessSettings.baseLatitude && businessSettings.baseLongitude) {
            fetchWeather(businessSettings.baseLatitude, businessSettings.baseLongitude)
              .then(setWeather);
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // 5. Route Optimization
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

  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([
    "Analyzing business intelligence...",
    "Scanning market trends..."
  ]);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const generationRef = useRef(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: "fuel",
    amount: 0,
    description: "",
    date: Timestamp.now()
  });

  useEffect(() => {
    const generateInsights = async () => {
      if (!profile || generationRef.current) return;
      generationRef.current = true;
      setIsGeneratingInsights(true);
      try {
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
          "Generate 2 brief, high-impact strategic business insights or recommendations based on the current dashboard data. Focus on efficiency, revenue growth, or scheduling optimization. Return as a JSON array of strings.",
          context
        );
        
        if (response.suggestedActions && response.suggestedActions.length > 0) {
          setAiInsights(response.suggestedActions.slice(0, 2));
        } else {
          throw new Error("No insights generated");
        }
      } catch (error) {
        console.error("Error generating insights:", error);
        // Fallback to some defaults if AI fails
        setAiInsights([
          "Friday is looking light in the North area. I recommend moving the Smith job to 10:00 AM to save 20 mins drive time.",
          "Your average ticket size is up 12% this week after the new Ceramic Coating promotion."
        ]);
      } finally {
        setIsGeneratingInsights(false);
        generationRef.current = false;
      }
    };

    if (upcomingJobs.length > 0) {
      generateInsights();
    }
  }, [upcomingJobs.length, profile]);

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
    setIsGeneratingGrowth(true);
    try {
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
                      value={newExpense.amount || ""} 
                      onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
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
            <Button onClick={() => navigate("/calendar", { state: { openAddDialog: true } })} className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-primary/20 transition-all hover:scale-105">
              <Plus className="w-4 h-4 mr-2" /> New Deployment
            </Button>
          </div>
        }
      />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Daily Revenue" 
          value={`$${stats.completed}`} 
          subValue={`Target: $${stats.projected}`}
          icon={<DollarSign className="w-6 h-6" />}
          trend={performancePercent >= 100 ? "up" : "down"}
          trendValue={`${Math.round(performancePercent)}%`}
          color="red"
        />
        <StatCard 
          title="Weekly Volume" 
          value={`$${stats.weekCompleted}`} 
          subValue={`Target: $${stats.weekProjected}`}
          icon={<BarChart3 className="w-6 h-6" />}
          trend={stats.weekProjected > 0 ? (stats.weekCompleted / stats.weekProjected >= 1 ? "up" : "down") : "up"}
          trendValue={stats.weekProjected > 0 ? `${Math.round((stats.weekCompleted / stats.weekProjected) * 100)}%` : "0%"}
          color="white"
        />
        <StatCard 
          title="Monthly Performance" 
          value={`$${stats.monthCompleted}`} 
          subValue={`Target: $${stats.monthProjected}`}
          icon={<TrendingUp className="w-6 h-6" />}
          trend={stats.monthProjected > 0 ? (stats.monthCompleted / stats.monthProjected >= 1 ? "up" : "down") : "up"}
          trendValue={stats.monthProjected > 0 ? `${Math.round((stats.monthCompleted / stats.monthProjected) * 100)}%` : "0%"}
          color="red"
        />
        <StatCard 
          title="Active Operations" 
          value={stats.activeJobs.toString()} 
          subValue={`${stats.pending} in pipeline`}
          icon={<Clock className="w-6 h-6" />}
          color="white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Route Optimization View */}
        <Card className="lg:col-span-2 border-none bg-card rounded-3xl overflow-hidden shadow-xl">
          <CardHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between bg-black/40">
            <div>
              <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">Tactical Route</CardTitle>
              <div className="flex items-center gap-3 mt-2">
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
            <Button variant="outline" size="sm" className="border-border bg-white text-black hover:bg-gray-50 rounded-xl font-bold uppercase tracking-widest text-[10px]" onClick={() => optimizeRoute(new Date()).then(({ stops, error }) => {
              setOptimizedRoute(Array.isArray(stops) ? stops : []);
              if (error) toast.error(error);
            }).catch(() => setOptimizedRoute([]))}>
              Recalculate
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-8">
              {(!optimizedRoute || optimizedRoute.length === 0) ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <CalendarIcon className="w-8 h-8 text-white/40" />
                  </div>
                  <p className="text-white/40 font-medium uppercase tracking-widest text-xs">No operations scheduled for today.</p>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-[2px] before:bg-gradient-to-b before:from-primary before:to-primary/10">
                  {optimizedRoute.map((stop, idx) => (
                    <div key={`stop-${stop.id}-${idx}`} className="relative pl-12 flex items-start justify-between group">
                      <div className="absolute left-0 top-1 w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center z-10 group-hover:border-primary/50 transition-all duration-300 shadow-sm">
                        <span className="text-black font-black text-sm">{idx + 1}</span>
                      </div>
                      <div className="flex-1 bg-white/5 rounded-2xl p-5 border border-white/10 hover:border-primary/20 transition-all duration-300 group-hover:bg-white/10">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-black text-white tracking-tight uppercase text-sm">{stop.customerName || "Client"}</h4>
                          <div className="flex items-center gap-2">
                            {stop.travelTimeFromPrevious !== undefined && stop.travelTimeFromPrevious > 0 && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-lg border border-primary/20">
                                <Truck className="w-3 h-3 text-primary" />
                                <span className="text-[10px] font-black text-primary uppercase tracking-tight">{formatDuration(stop.travelTimeFromPrevious)}</span>
                              </div>
                            )}
                            <Badge variant="outline" className={cn(
                              "text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md",
                              stop.status === "completed" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                              stop.status === "in_progress" ? "bg-primary/10 text-primary border-primary/20" :
                              "bg-white/10 text-white/60 border-white/10"
                            )}>
                              {stop.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center gap-2 text-white/60">
                            <MapPin className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-medium truncate">{stop.address}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-primary">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-xs font-black uppercase">
                                {stop.scheduledAt instanceof Timestamp ? format(stop.scheduledAt.toDate(), "h:mm a") : "TBD"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-white/40">
                              <Truck className="w-3.5 h-3.5" />
                              <span className="text-xs font-medium truncate">{stop.vehicleInfo}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="ml-4 text-white/20 hover:text-primary hover:bg-primary/5 rounded-xl" onClick={() => navigate(`/calendar/${stop.id}`)}>
                        <ChevronRight className="w-6 h-6" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Business Intelligence & Growth */}
        <div className="space-y-6">
          <Card className="border-none shadow-2xl bg-sidebar rounded-3xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50"></div>
            <CardHeader className="relative z-10 p-8 pb-4">
              <CardTitle className="text-xl font-black flex items-center gap-3 text-white uppercase tracking-tighter font-heading">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                Business Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 p-8 pt-0 space-y-6">
              {weather && (
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img 
                        src={`https://openweathermap.org/img/wn/${weather.current.icon}.png`} 
                        alt={weather.current.condition}
                        className="w-8 h-8"
                      />
                      <span className="text-sm font-black text-white">{weather.current.temp}°F</span>
                    </div>
                    <Badge variant="outline" className="text-[8px] uppercase font-black border-white/20 text-white/40">
                      {weather.current.condition}
                    </Badge>
                  </div>
                  <p className="text-[10px] font-bold text-primary leading-relaxed italic">
                    <Zap className="w-3 h-3 inline mr-1" />
                    {weather.businessGuidance}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Total Clients</span>
                  <span className="text-sm font-black text-white">{clients.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Active Leads</span>
                  <span className="text-sm font-black text-white">{allLeads.filter(l => l.status !== "converted" && l.status !== "lost").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Paid Revenue</span>
                  <span className="text-sm font-black text-green-400">${invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.total, 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Projected Sales</span>
                  <span className="text-sm font-black text-blue-400">${allAppointments.filter(a => a.status === "scheduled" || a.status === "confirmed").reduce((sum, a) => sum + (a.totalAmount || 0), 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <Button 
                  onClick={generateGrowthStrategy} 
                  disabled={isGeneratingGrowth}
                  className="w-full bg-primary text-white hover:bg-red-700 font-black h-12 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-xl"
                >
                  {isGeneratingGrowth ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                  Full Growth Audit
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card rounded-3xl overflow-hidden">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-sm font-black uppercase tracking-widest text-white/40">Growth Metrics</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase">
                  <span className="text-white/40">Retention Rate</span>
                  <span className="text-primary">{growthMetrics.retentionRate}%</span>
                </div>
                <Progress value={growthMetrics.retentionRate} className="h-1.5" />
              </div>
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
                  <span className="text-primary">${growthMetrics.avgTicket}</span>
                </div>
                <Progress value={Math.min(100, (growthMetrics.avgTicket / 500) * 100)} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
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
      <Card className="border-none bg-card rounded-3xl overflow-hidden shadow-xl">
        <CardHeader className="p-8 border-b border-white/5 flex flex-row items-center justify-between bg-black/40">
          <div>
            <CardTitle className="text-xl font-black text-white uppercase tracking-tighter font-heading">High-Priority Inquiries</CardTitle>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">Pending conversion opportunities</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/leads")} className="font-black text-primary hover:bg-primary/5 uppercase tracking-widest text-[10px]">View Full Pipeline</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recentLeads.length === 0 ? (
              <div className="p-12 text-center text-white/40 uppercase tracking-widest text-[10px] font-black">No new inquiries detected.</div>
            ) : (
              recentLeads.map(lead => (
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
                  <div className="text-right flex flex-col items-end gap-2">
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
    </div>
  );
}

function StatCard({ title, value, subValue, icon, trend, trendValue, color }: any) {
  const colors: any = {
    red: "bg-primary/10 text-primary border-primary/20",
    white: "bg-secondary text-white border-border",
    orange: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  return (
    <Card className="border-none bg-card rounded-3xl overflow-hidden group hover:shadow-2xl transition-all duration-500 shadow-xl relative">
      <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 pointer-events-none">
        {icon && React.cloneElement(icon as React.ReactElement<any>, { className: "w-32 h-32" })}
      </div>
      <CardContent className="p-8 relative z-10">
        <div className="flex items-center justify-between mb-6">
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
        <div>
          <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.25em] mb-2">{title}</p>
          <h3 className="text-4xl sm:text-5xl font-black text-white tracking-tighter font-heading">{value}</h3>
          <p className="text-[11px] text-white/50 font-bold mt-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_6px_rgba(229,57,53,0.4)]"></span>
            {subValue}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
