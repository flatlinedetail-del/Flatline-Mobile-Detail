import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings2, AlertTriangle, Trash2 } from "lucide-react";

export function JobSettings() {
  return (
    <div className="space-y-8">
      <Card className="bg-white/5 border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <CardHeader className="p-8 border-b border-white/5 bg-black/40">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl text-white">
              <Settings2 className="w-5 h-5" />
            </div>
            <CardTitle className="text-xl font-black text-white uppercase tracking-tighter">Job Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center justify-between p-4 bg-red-950/20 border border-red-500/10 rounded-2xl">
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-5 h-5 text-primary" />
              <div>
                <p className="font-black text-white uppercase text-xs">Danger Zone</p>
                <p className="text-[10px] text-white/40">Operation cancellation is irreversible.</p>
              </div>
            </div>
            <Button variant="destructive" className="bg-primary/10 text-primary hover:bg-primary hover:text-white font-black uppercase text-[10px] rounded-xl px-4">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Cancel Operation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
