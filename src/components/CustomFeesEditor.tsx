import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { StandardInput } from "./StandardInput";
import { CustomFee } from "../types";
import { cn } from "@/lib/utils";

interface CustomFeesEditorProps {
  fees: CustomFee[];
  onChange: (fees: CustomFee[]) => void;
  serviceFeeLabel?: string;
  travelFeeAmount?: number;
  onTravelFeeChange?: (amount: number) => void;
  theme?: "light" | "dark";
}

export function CustomFeesEditor({ 
  fees = [], 
  onChange, 
  serviceFeeLabel = "Travel Fee",
  travelFeeAmount,
  onTravelFeeChange,
  theme = "light"
}: CustomFeesEditorProps) {
  
  const addFee = () => {
    const newFee: CustomFee = {
      id: Math.random().toString(36).substr(2, 9),
      name: "",
      amount: 0,
      isTaxable: false
    };
    onChange([...fees, newFee]);
  };

  const updateFee = (id: string, updates: Partial<CustomFee>) => {
    onChange(fees.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const removeFee = (id: string) => {
    onChange(fees.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#A0A0A0]">Additional Fees</h4>
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          onClick={addFee}
          className="h-8 text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/80"
        >
          <Plus className="w-3 h-3 mr-1" /> Add Custom Fee
        </Button>
      </div>

      <div className="space-y-3">
        {/* Primary Service/Travel Fee (Handled explicitly usually) */}
        {onTravelFeeChange !== undefined && (
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-8">
              <div className="text-[9px] font-bold text-white/40 mb-1 ml-1 uppercase tracking-wider">{serviceFeeLabel}</div>
              <div className="h-10 bg-black/20 border border-white/5 rounded-lg flex items-center px-4 text-xs font-bold text-white/60 line-clamp-1">
                {serviceFeeLabel} (Centralized)
              </div>
            </div>
            <div className="col-span-4">
              <StandardInput
                variant="currency"
                className="h-10 bg-black/40 border-white/10 text-white rounded-lg font-bold"
                value={travelFeeAmount}
                onValueChange={onTravelFeeChange}
              />
            </div>
          </div>
        )}

        {/* Custom Fees */}
        {fees.map((fee) => (
          <div key={fee.id} className="grid grid-cols-12 gap-3 items-start animate-in fade-in slide-in-from-top-1">
            <div className="col-span-7">
              <StandardInput
                placeholder="Fee description (e.g. Pet Hair)"
                className="h-10 bg-black/40 border-white/10 text-white rounded-lg font-bold"
                value={fee.name}
                onValueChange={(val) => updateFee(fee.id, { name: val })}
              />
            </div>
            <div className="col-span-4">
              <StandardInput
                variant="currency"
                className="h-10 bg-black/40 border-white/10 text-white rounded-lg font-bold"
                value={fee.amount}
                onValueChange={(val) => updateFee(fee.id, { amount: val })}
              />
            </div>
            <div className="col-span-1 flex justify-center pt-2">
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                onClick={() => removeFee(fee.id)}
                className="h-6 w-6 text-red-500/40 hover:text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        {fees.length === 0 && onTravelFeeChange === undefined && (
          <p className="text-[10px] text-white/20 italic text-center py-2">No additional fees added.</p>
        )}
      </div>
    </div>
  );
}
