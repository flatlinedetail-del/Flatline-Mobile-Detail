import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, Timestamp, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
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
import { cn } from "../lib/utils";
import { Appointment, Expense } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

export default function Reports() {
  const [timeRange, setTimeRange] = useState("this_month");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    const unsubAppts = onSnapshot(qAppts, (snap) => {
      setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    });

    const unsubExpenses = onSnapshot(qExpenses, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    setLoading(false);
    return () => {
      unsubAppts();
      unsubExpenses();
    };
  }, [timeRange]);

  const totalSales = appointments
    .filter(a => a.status === "completed" || a.status === "paid")
    .reduce((sum, a) => sum + a.totalAmount, 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSales - totalExpenses;
  const commissionRate = 0.3; // 30%
  const totalCommissions = totalSales * commissionRate;

  // Chart Data
  const days = eachDayOfInterval({
    start: timeRange === "this_month" ? startOfMonth(new Date()) : startOfMonth(subMonths(new Date(), 1)),
    end: timeRange === "this_month" ? endOfMonth(new Date()) : endOfMonth(subMonths(new Date(), 1))
  });

  const chartData = days.map(day => {
    const daySales = appointments
      .filter(a => (a.status === "completed" || a.status === "paid") && isSameDay(a.scheduledAt.toDate(), day))
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

  const COLORS = ["#E11D48", "#000000", "#10b981", "#f59e0b"];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter">REPORTS</h1>
          <p className="text-gray-500 font-medium">Analyze your business performance and financials.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] bg-white border-gray-200 font-bold">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-gray-200">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportCard 
          title="Total Sales" 
          value={`$${totalSales.toLocaleString()}`} 
          icon={<DollarSign className="w-6 h-6 text-primary" />}
          color="red"
        />
        <ReportCard 
          title="Expenses" 
          value={`$${totalExpenses.toLocaleString()}`} 
          icon={<ArrowDownRight className="w-6 h-6 text-red-600" />}
          color="red"
        />
        <ReportCard 
          title="Net Profit" 
          value={`$${netProfit.toLocaleString()}`} 
          icon={<TrendingUp className="w-6 h-6 text-green-600" />}
          color="green"
        />
        <ReportCard 
          title="Commissions" 
          value={`$${totalCommissions.toLocaleString()}`} 
          icon={<Users className="w-6 h-6 text-purple-600" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <Card className="lg:col-span-2 border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b bg-gray-50/50">
            <CardTitle className="text-lg font-black text-gray-900">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#9ca3af" }}
                    interval={Math.floor(chartData.length / 7)}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#9ca3af" }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    cursor={{ fill: "#f9fafb" }}
                  />
                  <Bar dataKey="sales" fill="#E11D48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b bg-gray-50/50">
            <CardTitle className="text-lg font-black text-gray-900">Expense Breakdown</CardTitle>
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
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {expenseByCategory.map((cat, idx) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm font-bold text-gray-600">{cat.name}</span>
                  </div>
                  <span className="text-sm font-black text-gray-900">${cat.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Popularity */}
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50">
          <CardTitle className="text-lg font-black text-gray-900">Service Popularity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Avg. Price</TableHead>
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
                <TableRow key={name}>
                  <TableCell className="font-bold">{name}</TableCell>
                  <TableCell>{stats.count}</TableCell>
                  <TableCell>${Math.round(stats.revenue).toLocaleString()}</TableCell>
                  <TableCell>${Math.round(stats.revenue / stats.count).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {appointments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-gray-500">No data available for this period.</TableCell>
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
    red: "bg-red-50 text-primary",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600"
  };

  return (
    <Card className="border-none shadow-sm bg-white overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("p-3 rounded-2xl", colors[color])}>
            {icon}
          </div>
        </div>
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-3xl font-black text-gray-900 tracking-tighter">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
}
