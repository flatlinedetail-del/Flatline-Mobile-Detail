import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus, ShieldCheck } from "lucide-react";

export function JobForms() {
  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all hover:bg-white/[0.07]">
        <CardHeader className="p-8 border-b border-white/5 bg-black/40 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Digital Waivers & Forms</CardTitle>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">Legal & Operational Compliance</p>
          </div>
          <Button className="bg-primary hover:bg-red-700 text-white font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px]">
            <Plus className="w-3.5 h-3.5 mr-2" /> Add Form
          </Button>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-primary/50 transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-white uppercase text-sm tracking-tight">Main Liability Waiver</h4>
                  <p className="text-[10px] font-bold text-white/40">Status: Signed & Verified</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                <FileText className="w-4 h-4 text-white/40 group-hover:text-primary transition-colors" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
