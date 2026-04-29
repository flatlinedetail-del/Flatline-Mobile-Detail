import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { Appointment } from "@/types";

interface JobAnalyticsProps {
  appointment: Appointment;
}

export function JobAnalytics({ appointment }: JobAnalyticsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white/5 border-white/10 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <DollarSign className="w-3 h-3 text-primary" /> Projected Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-white">${appointment.totalAmount?.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white/5 border-white/10 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <Clock className="w-3 h-3 text-primary" /> Est. Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-white">2.5 Hours</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-primary" /> Efficiency Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-white">94%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10 rounded-2xl overflow-hidden">
        <CardHeader className="p-6 border-b border-white/5 bg-black/20">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-white">Operational Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center z-10 relative">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <div className="absolute top-8 left-4 bottom-0 w-0.5 bg-white/10" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Deployment Confirmed</p>
                <p className="text-xs text-white/40">Operation validated and resources allocated.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
