import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface JobOperationsProps {
  checklist: any[];
  toggleChecklistItem: (id: string) => void;
}

export function JobOperations({ checklist, toggleChecklistItem }: JobOperationsProps) {
  return (
    <div className="space-y-6">
      <Card className="bg-card border-white/5 rounded-3xl shadow-xl">
        <CardContent className="p-8">
          <div className="space-y-4">
            {checklist.map((item) => (
              <div 
                key={item.id} 
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer group",
                  item.completed 
                    ? "bg-green-500/10 border-green-500/20 opacity-60" 
                    : "bg-white/5 border-white/10 hover:border-primary/30"
                )}
                onClick={() => toggleChecklistItem(item.id)}
              >
                <Checkbox 
                  checked={item.completed} 
                  className="rounded-lg w-6 h-6 border-white/20 data-[state=checked]:bg-green-500 data-[state=checked]:border-none" 
                />
                <span className={cn(
                  "font-black uppercase tracking-tight text-sm",
                  item.completed ? "line-through text-white/20" : "text-white"
                )}>
                  {item.task}
                </span>
              </div>
            ))}
            {checklist.length === 0 && (
              <div className="text-center py-12">
                <p className="text-white/20 font-black uppercase tracking-widest text-[10px]">No operational protocols generated</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
