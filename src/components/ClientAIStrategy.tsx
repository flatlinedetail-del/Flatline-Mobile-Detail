import React, { useMemo } from "react";
import { 
  Brain, 
  TrendingUp, 
  Target, 
  MessageSquare, 
  Zap, 
  Calendar, 
  DollarSign, 
  Clock,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  Mail,
  Smartphone
} from "lucide-react";
import { format, differenceInDays, subMonths, isAfter } from "date-fns";
import { Client, Appointment, Invoice, Quote, Vehicle, Service } from "../types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn, formatCurrency } from "../lib/utils";
import { toast } from "sonner";

interface ClientAIStrategyProps {
  client: Client;
  appointments: Appointment[];
  invoices: Invoice[];
  quotes: Quote[];
  vehicles: Vehicle[];
  services: Service[];
}

export function ClientAIStrategy({ 
  client, 
  appointments, 
  invoices, 
  quotes, 
  vehicles, 
  services 
}: ClientAIStrategyProps) {
  
  const analysis = useMemo(() => {
    if (appointments.length === 0) return null;

    const completedApps = appointments.filter(a => a.status === "completed" || a.status === "paid");
    const totalSpend = completedApps.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const avgSpend = completedApps.length > 0 ? totalSpend / completedApps.length : 0;
    
    // Most common services
    const serviceCounts: Record<string, number> = {};
    completedApps.forEach(app => {
      app.serviceNames?.forEach(s => {
        serviceCounts[s] = (serviceCounts[s] || 0) + 1;
      });
    });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Frequency
    const lastApp = completedApps[0];
    const daysSinceLast = lastApp ? differenceInDays(new Date(), lastApp.scheduledAt.toDate()) : Infinity;
    
    let status: "active" | "at_risk" | "inactive" = "active";
    if (daysSinceLast > 120) status = "inactive";
    else if (daysSinceLast > 60) status = "at_risk";

    // Visit frequency (avg days between visits)
    let avgDaysBetween = 0;
    if (completedApps.length > 1) {
      const first = completedApps[completedApps.length - 1].scheduledAt.toDate();
      const last = completedApps[0].scheduledAt.toDate();
      const totalDays = differenceInDays(last, first);
      avgDaysBetween = totalDays / (completedApps.length - 1);
    }

    // Service Mix
    const serviceNames = appointments.flatMap(a => a.serviceNames || []);
    const hasCeramic = serviceNames.some(s => s.toLowerCase().includes("ceramic"));
    const hasInterior = serviceNames.some(s => s.toLowerCase().includes("interior"));
    const hasExterior = serviceNames.some(s => s.toLowerCase().includes("exterior"));
    const hasDetail = serviceNames.some(s => s.toLowerCase().includes("detail"));

    let profileType = "Mixed Services";
    if (hasInterior && !hasExterior) profileType = "Interior Focused";
    else if (hasExterior && !hasInterior) profileType = "Exterior Focused";
    else if (hasCeramic) profileType = "High-End Protection";

    return {
      totalSpend,
      avgSpend,
      topServices,
      daysSinceLast,
      status,
      avgDaysBetween,
      visitCount: completedApps.length,
      profileType,
      hasCeramic,
      hasInterior,
      hasExterior,
      hasDetail
    };
  }, [appointments]);

  const recommendations = useMemo(() => {
    if (!analysis) return [];
    const recs: { title: string; reason: string; type: "maintenance" | "upsell" | "reactivation" }[] = [];
    
    // 1. Maintenance Logic
    if (analysis.hasCeramic && analysis.daysSinceLast > 180) {
      recs.push({
        title: "Ceramic Coating Maintenance",
        reason: "It's been over 6 months since the last ceramic service. A maintenance wash is recommended to preserve the hydrophobic properties and warranty.",
        type: "maintenance"
      });
    }

    if (analysis.avgDaysBetween > 0 && analysis.daysSinceLast > (analysis.avgDaysBetween * 1.5)) {
      recs.push({
        title: "Routine Maintenance Overdue",
        reason: `This client typically visits every ${Math.round(analysis.avgDaysBetween)} days. They are currently at ${analysis.daysSinceLast} days, indicating they are overdue for their regular service.`,
        type: "maintenance"
      });
    }

    // 2. Upsell Logic
    if (analysis.hasExterior && !analysis.hasInterior) {
      recs.push({
        title: "Full Interior Sanitization",
        reason: "Client consistently prioritizes exterior aesthetics. Recommending a deep interior clean to match the exterior condition.",
        type: "upsell"
      });
    }

    if (analysis.visitCount > 3 && !client.isVIP) {
      recs.push({
        title: "VIP Loyalty Conversion",
        reason: "Frequent engagement pattern detected. Offering VIP status with a recurring maintenance plan would secure consistent monthly recurring revenue.",
        type: "upsell"
      });
    }

    const hasLargeVehicle = vehicles.some(v => v.size === "large" || v.size === "extra_large");
    if (hasLargeVehicle && !analysis.hasCeramic) {
      recs.push({
        title: "Large Asset Protection",
        reason: "Client has large-scale vehicles registered. A ceramic coating would significantly reduce maintenance time and protect the extensive surface area.",
        type: "upsell"
      });
    }

    // 3. Reactivation
    if (analysis.status === "inactive") {
      recs.push({
        title: "Strategic Reactivation",
        reason: "Client has been inactive for over 120 days. A high-value reactivation offer is required to prevent total churn.",
        type: "reactivation"
      });
    }

    return recs;
  }, [analysis, client.isVIP, vehicles]);

  const marketingStrategy = useMemo(() => {
    if (!analysis) return null;

    let goal = "Retention";
    let angle = "Quality & Consistency";
    let offer = "Complimentary add-on (e.g., Tire Shine or Rain-X)";

    if (analysis.status === "inactive") {
      goal = "Reactivation";
      angle = "Welcome Back Discount";
      offer = "20% off any Full Detail package";
    } else if (analysis.status === "at_risk") {
      goal = "Retention";
      angle = "Priority Scheduling";
      offer = "$25 off next service if booked this week";
    } else if (analysis.visitCount > 5) {
      goal = "Loyalty Upsell";
      angle = "Exclusive VIP Upgrade";
      offer = "Upgrade to Ceramic Maintenance at standard wash price";
    }

    return { goal, angle, offer };
  }, [analysis]);

  const outreachTemplates = useMemo(() => {
    if (!analysis || !marketingStrategy) return null;

    const firstName = client.firstName || "there";
    const lastService = analysis.topServices[0] || "detail";

    if (analysis.status === "inactive") {
      return {
        sms: `Hey ${firstName}, it's been a while since your last ${lastService}! We'd love to get your vehicle looking its best again. Use code BACK20 for 20% off any Full Detail package this week. Book here: [Link]`,
        email: `Subject: We miss you, ${firstName}! | 20% Off Inside\n\nHi ${firstName},\n\nIt's been over 4 months since your last visit, and we'd love to help you get that "new car feel" back. Since you've previously enjoyed our ${lastService}, we're offering you an exclusive 20% discount on any Full Detail package if you book by Sunday.\n\nClaim your offer here: [Link]`
      };
    }

    if (analysis.status === "at_risk") {
      return {
        sms: `Hi ${firstName}, your vehicle is due for a seasonal refresh! Book your next service this week and get $25 off as a thank you for being a regular. Reply to book!`,
        email: `Subject: Priority Access: $25 Off Your Next Refresh\n\nHi ${firstName},\n\nIt's been a few months since your last visit, and with the changing weather, it's the perfect time for a seasonal refresh. As one of our preferred clients, we've set aside a priority slot for you this week with a $25 discount.\n\nBook your refresh here: [Link]`
      };
    }

    return {
      sms: `Hi ${firstName}, hope you're loving the shine! Since you're a regular, we wanted to offer you a complimentary Ceramic Sealant upgrade on your next visit. Just mention this text!`,
      email: `Subject: A Special Upgrade for a Valued Client\n\nHi ${firstName},\n\nWe love keeping your vehicle in top shape! Since you're one of our most frequent clients, we want to offer you a complimentary Ceramic Sealant upgrade (a $50 value) on your next scheduled visit.\n\nSchedule your next shine here: [Link]`
    };
  }, [analysis, marketingStrategy, client.firstName]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Template copied to clipboard");
  };

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-[2.5rem] border border-white/5 text-center px-6">
        <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center mb-6 border border-primary/20">
          <Brain className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Intelligence <span className="text-primary italic">Pending</span></h3>
        <p className="text-white/40 font-medium text-sm max-w-xs">
          Not enough client history yet to generate a tailored strategy. Complete at least one engagement to unlock AI insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/5 border-white/5 rounded-[2rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <Badge variant="outline" className={cn(
                "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                analysis.status === "active" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                analysis.status === "at_risk" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                "bg-red-500/10 text-red-500 border-red-500/20"
              )}>
                {analysis.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Lifetime Value</p>
            <p className="text-2xl font-black text-white tracking-tighter">{formatCurrency(analysis.totalSpend)}</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/5 rounded-[2rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
            </div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Avg. Frequency</p>
            <p className="text-2xl font-black text-white tracking-tighter">
              {analysis.avgDaysBetween > 0 ? `${Math.round(analysis.avgDaysBetween)} Days` : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/5 rounded-[2rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                <Zap className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Avg. Ticket</p>
            <p className="text-2xl font-black text-white tracking-tighter">{formatCurrency(analysis.avgSpend)}</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/5 rounded-[2rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-orange-500/10 rounded-2xl flex items-center justify-center border border-orange-500/20">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
            </div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Last Service</p>
            <p className="text-2xl font-black text-white tracking-tighter">{analysis.daysSinceLast} Days Ago</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recommendations & Upsells */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Strategic <span className="text-primary italic">Opportunities</span></h3>
          </div>
          
          <div className="space-y-4">
            {recommendations.map((rec, i) => (
              <div key={i} className="p-6 bg-white/5 rounded-[2rem] border border-white/5 flex gap-5 group hover:bg-white/[0.08] transition-all duration-300">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                  rec.type === "maintenance" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                  rec.type === "upsell" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                  "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                  {rec.type === "maintenance" ? <Clock className="w-6 h-6" /> :
                   rec.type === "upsell" ? <TrendingUp className="w-6 h-6" /> :
                   <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-black text-white uppercase tracking-tight text-sm">{rec.title}</h4>
                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40">{rec.type}</Badge>
                  </div>
                  <p className="text-xs text-white/40 font-medium leading-relaxed">{rec.reason}</p>
                </div>
              </div>
            ))}
            {recommendations.length === 0 && (
              <div className="p-8 bg-white/5 rounded-[2rem] border border-white/5 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3 opacity-20" />
                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Client is currently on a optimal service cycle.</p>
              </div>
            )}
          </div>
        </div>

        {/* Marketing Strategy */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Marketing <span className="text-primary italic">Playbook</span></h3>
          </div>

          {marketingStrategy && (
            <div className="p-8 bg-gradient-to-br from-black/60 to-black/20 rounded-[2.5rem] border border-white/5 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Brain className="w-32 h-32 text-white" />
              </div>
              
              <div className="grid grid-cols-2 gap-8 relative z-10">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Primary Goal</p>
                  <p className="text-lg font-black text-white tracking-tight uppercase">{marketingStrategy.goal}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">Message Angle</p>
                  <p className="text-lg font-black text-white tracking-tight uppercase">{marketingStrategy.angle}</p>
                </div>
              </div>

              <div className="p-6 bg-primary/10 rounded-[2rem] border border-primary/20 relative z-10">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Recommended Offer</p>
                <p className="text-sm font-black text-white uppercase tracking-wide">{marketingStrategy.offer}</p>
              </div>

              <div className="space-y-4 pt-4 relative z-10">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Suggested Outreach</p>
                <div className="grid grid-cols-1 gap-3">
                  <Button 
                    variant="outline" 
                    className="justify-start h-auto py-4 px-5 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 group"
                    onClick={() => outreachTemplates && copyToClipboard(outreachTemplates.sms)}
                  >
                    <Smartphone className="w-5 h-5 mr-4 text-primary group-hover:scale-110 transition-transform" />
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2">SMS Template</p>
                      <p className="text-[11px] text-white/60 font-medium leading-relaxed italic">
                        "{outreachTemplates?.sms}"
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 ml-3 opacity-20 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Button>
                  <Button 
                    variant="outline" 
                    className="justify-start h-auto py-4 px-5 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 group"
                    onClick={() => outreachTemplates && copyToClipboard(outreachTemplates.email)}
                  >
                    <Mail className="w-5 h-5 mr-4 text-primary group-hover:scale-110 transition-transform" />
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2">Email Template</p>
                      <p className="text-[11px] text-white/60 font-medium leading-relaxed italic">
                        "{outreachTemplates?.email.split('\n\n')[0]}..."
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 ml-3 opacity-20 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Behavior Analysis */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-black text-white uppercase tracking-tighter font-heading">Behavioral <span className="text-primary italic">Fingerprint</span></h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Most Used Services</p>
            <div className="space-y-3">
              {analysis.topServices.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wide">{s}</span>
                  <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary" 
                      style={{ width: `${100 - (i * 30)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Engagement Pulse</p>
            <div className="flex items-end gap-2 h-24">
              {Array.from({ length: 12 }).map((_, i) => {
                const month = subMonths(new Date(), 11 - i);
                const hasApp = appointments.some(a => 
                  a.status === "completed" && 
                  format(a.scheduledAt.toDate(), "MMM yyyy") === format(month, "MMM yyyy")
                );
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "flex-1 rounded-t-lg transition-all duration-500",
                      hasApp ? "bg-primary h-full" : "bg-white/5 h-2"
                    )}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[8px] font-black text-white/20 uppercase tracking-widest">
              <span>12 Months Ago</span>
              <span>Today</span>
            </div>
          </div>

          <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4">Asset Coverage</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wide">Profile Type</span>
                <span className="text-xs font-black text-primary uppercase">{analysis.profileType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wide">Vehicles Registered</span>
                <span className="text-xs font-black text-primary">{vehicles.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wide">Quotes Requested</span>
                <span className="text-xs font-black text-primary">{quotes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wide">VIP Status</span>
                <Badge className={cn(
                  "text-[8px] font-black uppercase tracking-widest",
                  client.isVIP ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" : "bg-white/5 text-white/40 border-white/10"
                )}>
                  {client.isVIP ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
