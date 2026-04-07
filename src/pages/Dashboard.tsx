import { useState, useEffect } from "react";
import { query, where, onSnapshot, Timestamp, orderBy, limit, getDocs, addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
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
  Receipt
} from "lucide-react";
import { format, startOfDay, endOfDay, isToday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { optimizeRoute, RouteStop } from "@/lib/scheduling";
import { Appointment, Lead, Expense } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    projected: 0,
    completed: 0,
    pending: 0,
    leadsCount: 0,
    activeJobs: 0
  });
  const [upcomingJobs, setUpcomingJobs] = useState<Appointment[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    // 1. Real-time Stats & Performance
    const qStats = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", Timestamp.fromDate(start)),
      where("scheduledAt", "<=", Timestamp.fromDate(end))
    );

    const unsubStats = onSnapshot(qStats, (snapshot) => {
      let proj = 0;
      let comp = 0;
      let pend = 0;
      let active = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Appointment;
        proj += data.totalAmount;
        if (data.status === "completed" || data.status === "paid") {
          comp += data.totalAmount;
        } else if (data.status !== "canceled") {
          pend += data.totalAmount;
          if (data.status === "in_progress" || data.status === "en_route") {
            active++;
          }
        }
      });
      
      setStats(prev => ({ ...prev, projected: proj, completed: comp, pending: pend, activeJobs: active }));
    });

    // 2. Upcoming Jobs
    const qJobs = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", Timestamp.fromDate(start)),
      orderBy("scheduledAt", "asc"),
      limit(5)
    );

    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      setUpcomingJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    });

    // 3. Recent Leads
    const qLeads = query(
      collection(db, "leads"),
      where("status", "==", "new"),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    const unsubLeads = onSnapshot(qLeads, (snapshot) => {
      setRecentLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)));
      setStats(prev => ({ ...prev, leadsCount: snapshot.size }));
    });

    // 4. Route Optimization
    optimizeRoute(today).then(setOptimizedRoute);

    setLoading(false);
    return () => {
      unsubStats();
      unsubJobs();
      unsubLeads();
    };
  }, []);

  const performancePercent = stats.projected > 0 ? (stats.completed / stats.projected) * 100 : 0;

  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: "fuel",
    amount: 0,
    description: "",
    date: Timestamp.now()
  });

  const handleAddExpense = async () => {
    try {
      if (!newExpense.amount || !newExpense.description) {
        toast.error("Please fill in all fields");
        return;
      }
      await addDoc(collection(db, "expenses"), {
        ...newExpense,
        technicianId: profile?.uid,
        date: Timestamp.now()
      });
      toast.success("Expense added successfully");
      setIsExpenseDialogOpen(false);
      setNewExpense({ category: "fuel", amount: 0, description: "" });
    } catch (error) {
      toast.error("Failed to add expense");
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">
            G'day, {profile?.displayName?.split(" ")[0]}!
          </h1>
          <p className="text-gray-500 font-medium">Here's your business at a glance for {format(new Date(), "EEEE, MMM d")}.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
            <DialogTrigger render={
              <Button variant="outline" className="border-gray-200">
                <Receipt className="w-4 h-4 mr-2" /> Log Expense
              </Button>
            } />
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-black">Log Business Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="font-bold">Category</Label>
                  <Select 
                    value={newExpense.category} 
                    onValueChange={(v: any) => setNewExpense({ ...newExpense, category: v })}
                  >
                    <SelectTrigger className="bg-white border-gray-200">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="supplies">Supplies</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">Amount ($)</Label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    className="bg-white border-gray-200"
                    value={newExpense.amount || ""} 
                    onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">Description</Label>
                  <Input 
                    placeholder="e.g. Gas for van, Microfiber towels" 
                    className="bg-white border-gray-200"
                    value={newExpense.description} 
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  />
                </div>
                <Button className="w-full bg-primary text-white hover:bg-red-700 font-bold" onClick={handleAddExpense}>
                  Save Expense
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={() => navigate("/appointments")} className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100">
            <CalendarIcon className="w-4 h-4 mr-2" /> Schedule Job
          </Button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Daily Sales" 
          value={`$${stats.completed}`} 
          subValue={`of $${stats.projected} projected`}
          icon={<DollarSign className="w-6 h-6 text-primary" />}
          trend={performancePercent >= 100 ? "up" : "down"}
          trendValue={`${Math.round(performancePercent)}%`}
          color="red"
        />
        <StatCard 
          title="Active Jobs" 
          value={stats.activeJobs.toString()} 
          subValue={`${stats.pending / 100}k pending revenue`}
          icon={<Clock className="w-6 h-6 text-black" />}
          color="black"
        />
        <StatCard 
          title="New Leads" 
          value={stats.leadsCount.toString()} 
          subValue="requiring follow-up"
          icon={<UserPlus className="w-6 h-6 text-primary" />}
          color="red"
        />
        <StatCard 
          title="Route Status" 
          value={optimizedRoute.length > 0 ? "Optimized" : "No Jobs"}
          subValue={`${optimizedRoute.length} stops today`}
          icon={<MapPin className="w-6 h-6 text-black" />}
          color="black"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Route Optimization View */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b bg-gray-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-gray-900">Today's Optimized Route</CardTitle>
              <p className="text-xs text-gray-500 font-medium">Sequence based on travel efficiency</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => optimizeRoute(new Date()).then(setOptimizedRoute)}>
              Re-Optimize
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {optimizedRoute.length === 0 ? (
                <div className="p-12 text-center text-gray-400">No jobs scheduled for today.</div>
              ) : (
                optimizedRoute.map((stop, idx) => (
                  <div key={stop.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors group">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      {idx < optimizedRoute.length - 1 && <div className="w-0.5 h-12 bg-gray-200" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-gray-900">{stop.customerName}</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] uppercase font-black",
                          stop.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                          stop.status === "in_progress" ? "bg-red-50 text-primary border-red-200" :
                          "bg-gray-50 text-gray-700 border-gray-200"
                        )}>
                          {stop.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" /> {stop.address}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-xs font-bold text-primary flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {format(stop.scheduledAt.toDate(), "h:mm a")}
                        </p>
                        <p className="text-xs text-gray-400 font-medium">{stop.vehicleInfo}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/appointments/${stop.id}`)}>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Assistant Quick Actions */}
        <Card className="border-none shadow-sm bg-black text-white overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" /> AI Business Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white/5 rounded-xl p-4 text-sm backdrop-blur-sm border border-white/10">
              "Friday is looking light in the North area. I recommend moving the Smith job to 10:00 AM to save 20 mins drive time."
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-sm backdrop-blur-sm border border-white/10">
              "Your average ticket size is up 12% this week after the new Ceramic Coating promotion."
            </div>
            <Button 
              className="w-full bg-primary text-white hover:bg-red-700 font-bold mt-4"
              onClick={() => (window as any).openAIAssistant?.()}
            >
              Ask Assistant
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-black text-gray-900">Hot Leads</CardTitle>
            <p className="text-xs text-gray-500 font-medium">New inquiries requiring immediate follow-up</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/leads")} className="font-bold text-primary hover:bg-red-50">View All Leads</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {recentLeads.map(lead => (
              <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-primary">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{lead.name}</p>
                    <p className="text-xs text-gray-500">{lead.requestedService} • {lead.vehicleInfo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={cn(
                    "text-[10px] uppercase font-black",
                    lead.priority === "hot" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                  )}>
                    {lead.priority}
                  </Badge>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">
                    {format(lead.createdAt.toDate(), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, subValue, icon, trend, trendValue, color }: any) {
  const colors: any = {
    red: "bg-red-50 text-primary",
    black: "bg-gray-100 text-black",
    orange: "bg-orange-50 text-orange-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600"
  };

  return (
    <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-3 rounded-2xl", colors[color])}>
            {icon}
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full",
              trend === "up" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            )}>
              {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-3xl font-black text-gray-900 tracking-tighter">{value}</h3>
          <p className="text-xs text-gray-500 font-medium mt-1">{subValue}</p>
        </div>
      </CardContent>
    </Card>
  );
}
