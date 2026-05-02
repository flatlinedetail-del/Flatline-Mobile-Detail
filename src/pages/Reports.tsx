import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, getDocs, getDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Download,
  ArrowDownRight,
  Users
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, isSameDay } from "date-fns";
import { cn, formatCurrency } from "../lib/utils";
import { Appointment, Expense, BusinessSettings } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { ShieldAlert } from "lucide-react";

export default function Reports() {
  const { profile, loading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState("this_month");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  if (authLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-black text-white">Access Denied</h2>
        <p className="text-white font-medium text-center max-w-md">
          You do not have permission to access business reports. Please contact an administrator if you believe this is an error.
        </p>
        <Button onClick={() => window.history.back()} variant="outline">Go Back</Button>
      </div>
    );
  }

  useEffect(() => {
    if (authLoading || !profile || (profile.role !== "admin" && profile.role !== "manager")) return;

    const now = new Date();
    let start = startOfMonth(now);
    let end = endOfMonth(now);

    if (timeRange === "last_month") {
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
    }

    const qAppts = query(
      collection(db, "appointments"),
      where("scheduledAt", ">=", Timestamp.fromDate(start)),
      where("scheduledAt", "<=", Timestamp.fromDate(end))
    );

    const qExpenses = query(
      collection(db, "expenses"),
      where("date", ">=", Timestamp.fromDate(start)),
      where("date", "<=", Timestamp.fromDate(end))
    );

    const fetchReportsData = async () => {
      try {
        const [apptsSnap, expensesSnap] = await Promise.all([
          getDocs(qAppts).catch(e => handleFirestoreError(e, OperationType.LIST, "appointments")),
          getDocs(qExpenses).catch(e => handleFirestoreError(e, OperationType.LIST, "expenses"))
        ]);
        if (!apptsSnap || !expensesSnap) return;
        setAppointments(apptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
        setExpenses(expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
        setLoading(false);
      } catch (error) {
        console.error("Error fetching reports data:", error);
        setLoading(false);
      }
    };

    fetchReportsData();
    return () => {};
  }, [timeRange, profile, authLoading]);

  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, "settings", "business"));
      if (snap.exists()) setSettings(snap.data() as BusinessSettings);
    };
    fetchSettings();
  }, []);

  const totalSales = appointments
    .filter(a => a.status === "completed" || a.status === "paid")
    .reduce((sum, a) => sum + a.totalAmount, 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSales - totalExpenses;
  
  const totalCommissions = appointments
    .filter(a => a.status === "completed" || a.status === "paid")
    .reduce((sum, a) => {
      if (a.commissionAmount !== undefined) return sum + a.commissionAmount;
      // Fallback for legacy appointments
      const rate = settings?.commissionRate || 0;
      const type = settings?.commissionType || "percentage";
      if (type === "percentage") return sum + (a.totalAmount * rate) / 100;
      return sum + rate;
    }, 0);

  // Chart Data
  const days = eachDayOfInterval({
    start: timeRange === "this_month" ? startOfMonth(new Date()) : startOfMonth(subMonths(new Date(), 1)),
    end: timeRange === "this_month" ? endOfMonth(new Date()) : endOfMonth(subMonths(new Date(), 1))
  });

  const chartData = days.map(day => {
    const daySales = appointments
      .filter(a => (a.status === "completed" || a.status === "paid") && a.scheduledAt && isSameDay(a.scheduledAt.toDate(), day))
      .reduce((sum, a) => sum + a.totalAmount, 0);
    
    return {
      name: format(day, "MMM d"),
      sales: daySales
    };
  });

  const expenseByCategory = [
    { name: "Fuel", value: expenses.filter(e => e.category === "fuel").reduce((sum, e) => sum + e.amount, 0) },
    { name: "Supplies", value: expenses.filter(e => e.category === "supplies").reduce((sum, e) => sum + e.amount, 0) },
    { name: "Marketing", value: expenses.filter(e => e.category === "marketing").reduce((sum, e) => sum + e.amount, 0) },
    { name: "Other", value: expenses.filter(e => e.category === "other").reduce((sum, e) => sum + e.amount, 0) },
  ].filter(cat => cat.value > 0);

  const COLORS = ["#0A4DFF", "#6366f1", "#8b5cf6", "#d946ef"];

  return (
    <div className="space-y-6 pb-20">
      <PageHeader 
        title="Business REPORTS" 
        accentWord="REPORTS" 
        subtitle="Performance Analytics & Growth Metrics"
        actions={
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px] bg-black/40 border-white/10 text-white rounded-xl h-12 font-bold focus:ring-primary/50">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="bg-[#0B0B0B] border border-white/10 text-white">
                <SelectItem value="this_month" className="focus:bg-white/5 focus:text-white">This Month</SelectItem>
                <SelectItem value="last_month" className="focus:bg-white/5 focus:text-white">Last Month</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl h-12 px-6 font-black uppercase tracking-widest text-[10px]">
              <Download className="w-4 h-4 mr-2 text-primary" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportCard 
          title="Total Sales" 
          value={formatCurrency(totalSales)} 
          icon={<DollarSign className="w-6 h-6 text-primary" />}
          color="blue"
        />
        <ReportCard 
          title="Expenses" 
          value={formatCurrency(totalExpenses)} 
          icon={<ArrowDownRight className="w-6 h-6 text-red-500" />}
          color="red"
        />
        <ReportCard 
          title="Net Profit" 
          value={formatCurrency(totalSales - totalExpenses)} 
          icon={<TrendingUp className="w-6 h-6 text-green-500" />}
          color="green"
        />
        <ReportCard 
          title="Commissions" 
          value={formatCurrency(totalCommissions)} 
          icon={<Users className="w-6 h-6 text-white" />}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <Card className="lg:col-span-2 border border-white/5 shadow-xl bg-[#0B0B0B] overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/40">
            <CardTitle className="text-lg font-black text-white uppercase tracking-tighter header-glow">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#FFFFFF" }}
                    interval={Math.floor(chartData.length / 7)}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#FFFFFF" }}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.5)" }}
                    itemStyle={{ color: '#FFFFFF', fontWeight: 'bold' }}
                    labelStyle={{ color: '#FFFFFF', marginBottom: '4px' }}
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  />
                  <Bar dataKey="sales" fill="#0A4DFF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border border-white/5 shadow-xl bg-[#0B0B0B] overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/40">
            <CardTitle className="text-lg font-black text-white uppercase tracking-tighter header-glow">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {[
                      { name: "Fuel", color: COLORS[0] },
                      { name: "Supplies", color: COLORS[1] },
                      { name: "Marketing", color: COLORS[2] },
                      { name: "Other", color: COLORS[3] }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)" }}
                    itemStyle={{ color: '#FFFFFF' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4 mt-8">
              {[
                { name: "Fuel", color: COLORS[0] },
                { name: "Supplies", color: COLORS[1] },
                { name: "Marketing", color: COLORS[2] },
                { name: "Other", color: COLORS[3] }
              ].filter(c => expenseByCategory.some(eb => eb.name === c.name)).map((cat, idx) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-bold text-white">{cat.name}</span>
                  </div>
                  <span className="text-sm font-black text-white">{formatCurrency(expenseByCategory.find(eb => eb.name === cat.name)?.value || 0)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Popularity */}
      <Card className="border border-white/5 shadow-xl bg-[#0B0B0B] overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-black/40">
          <CardTitle className="text-lg font-black text-white uppercase tracking-tighter header-glow">Service Popularity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Service Name</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Bookings</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Revenue</TableHead>
                <TableHead className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em]">Avg. Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(
                appointments.reduce((acc: any, app) => {
                  app.serviceNames?.forEach((service: string) => {
                    if (!acc[service]) acc[service] = { count: 0, revenue: 0 };
                    acc[service].count += 1;
                    acc[service].revenue += (app.totalAmount / (app.serviceNames?.length || 1));
                  });
                  return acc;
                }, {})
              ).map(([name, stats]: [string, any]) => (
                <TableRow key={name} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell className="px-8 py-6 font-black text-white uppercase tracking-tight text-sm shadow-sm">{name}</TableCell>
                  <TableCell className="px-8 py-6 text-white font-bold">{stats.count}</TableCell>
                  <TableCell className="px-8 py-6 text-white font-bold">{formatCurrency(stats.revenue)}</TableCell>
                  <TableCell className="px-8 py-6 text-white font-bold">{formatCurrency(stats.revenue / stats.count)}</TableCell>
                </TableRow>
              ))}
              {appointments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-20 text-white font-black uppercase tracking-widest text-[10px]">No data available for this period.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCard({ title, value, icon, color }: any) {
  const colors: any = {
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
    blue: "bg-primary/10 text-primary border-primary/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20"
  };

  return (
    <Card className="border border-white/5 shadow-xl bg-[#0B0B0B] overflow-hidden group hover:shadow-primary/5 transition-all duration-500">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-3 rounded-2xl border transition-transform duration-500 group-hover:scale-110 shadow-sm", colors[color])}>
            {icon}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-3xl font-black text-white tracking-tighter drop-shadow-sm">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}
