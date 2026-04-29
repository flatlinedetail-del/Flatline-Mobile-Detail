import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Scan, ImageIcon, Plus, Trash2, Save, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";

interface JobRevenueIntelProps {
  technicianAssessment: string;
  setTechnicianAssessment: (val: string) => void;
  assessmentTags: string[];
  toggleAssessmentTag: (tag: string) => void;
  assessmentImages: string[];
  handleAssessmentImageUpload: (e: any) => void;
  removeAssessmentImage: (index: number) => void;
  isGeneratingUpsells: boolean;
  generateUpsells: () => void;
  productCosts: any[];
  handleAddProductCost: () => void;
  handleUpdateProductCost: (id: string, updates: any) => void;
  handleDeleteProductCost: (id: string) => void;
  saveProductCosts: (costs: any[]) => void;
  revenueProtocol: any;
  recommendations: any[];
  pricingAnalysis: any;
  AVAILABLE_TAGS: string[];
}

export function JobRevenueIntel({
  technicianAssessment,
  setTechnicianAssessment,
  assessmentTags,
  toggleAssessmentTag,
  assessmentImages,
  handleAssessmentImageUpload,
  removeAssessmentImage,
  isGeneratingUpsells,
  generateUpsells,
  productCosts,
  handleAddProductCost,
  handleUpdateProductCost,
  handleDeleteProductCost,
  saveProductCosts,
  revenueProtocol,
  recommendations,
  pricingAnalysis,
  AVAILABLE_TAGS
}: JobRevenueIntelProps) {
  return (
    <Card className="border-none shadow-xl bg-card rounded-3xl">
      <CardHeader className="p-8 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Scan className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Tactical Upsell Intelligence</CardTitle>
            <p className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em] mt-1">AI-Powered Revenue Optimization</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-12">
        <div className="space-y-12">
          <div className="space-y-6">
            <Label className="font-black uppercase tracking-widest text-[10px] text-white/60">Field Assessment</Label>
            
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map(tag => (
                <Badge 
                  key={tag}
                  variant="outline"
                  className={cn(
                    "cursor-pointer uppercase font-black text-[9px] tracking-widest border-white/10 px-3 py-1.5 rounded-lg transition-colors",
                    assessmentTags.includes(tag) 
                      ? "bg-primary text-white border-primary" 
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                  onClick={() => toggleAssessmentTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea 
                className="w-full h-32 p-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Describe additional details..."
                value={technicianAssessment}
                onChange={(e) => setTechnicianAssessment(e.target.value)}
              />

              <div className="h-32 rounded-2xl bg-white/5 border border-white/10 p-4 overflow-y-auto custom-scrollbar">
                <div className="flex flex-wrap gap-2">
                  {assessmentImages.map((img, i) => (
                    <div key={i} className="relative group w-16 h-16">
                      <img src={img} alt="Assessment" className="w-full h-full object-cover rounded-xl" />
                      <button 
                        onClick={() => removeAssessmentImage(i)}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="w-16 h-16 flex flex-col items-center justify-center border-2 border-dashed border-white/20 rounded-xl hover:border-white/40 hover:bg-white/5 transition-colors cursor-pointer">
                    <ImageIcon className="w-5 h-5 text-white/40 mb-1" />
                    <span className="text-[7px] uppercase font-bold tracking-widest text-white/40 text-center">Add Photo</span>
                    <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleAssessmentImageUpload} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <Label className="font-black uppercase tracking-widest text-[10px] text-primary">Internal Job Costs</Label>
              <Button variant="outline" size="sm" onClick={handleAddProductCost} className="h-7 text-[8px] font-black uppercase tracking-widest border-white/20">
                <Plus className="w-3 h-3 mr-1" /> Add Cost
              </Button>
            </div>
            {productCosts.length > 0 && (
              <div className="space-y-2">
                {productCosts.map((cost) => (
                  <div key={cost.id} className="flex gap-2 items-center bg-white/5 p-2 rounded-lg border border-white/5">
                    <Input value={cost.name} onChange={(e) => handleUpdateProductCost(cost.id, { name: e.target.value })} className="h-7 text-[9px] bg-black/20" />
                    <Input type="number" value={cost.quantity} onChange={(e) => handleUpdateProductCost(cost.id, { quantity: parseFloat(e.target.value) || 0 })} className="h-7 w-16 text-[9px] bg-black/20" />
                    <Input type="number" value={cost.unitCost} onChange={(e) => handleUpdateProductCost(cost.id, { unitCost: parseFloat(e.target.value) || 0 })} className="h-7 w-16 text-[9px] bg-black/20" />
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteProductCost(cost.id)} className="h-7 w-7 text-white/40 hover:text-red-500 bg-white/10">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button className="w-full h-7 text-[8px] font-black uppercase tracking-widest bg-white/5 border border-white/10" onClick={() => saveProductCosts(productCosts)}>
                  <Save className="w-3 h-3 mr-2" /> Lock Costs
                </Button>
              </div>
            )}
          </div>

          <Button className="w-full bg-primary text-white font-black h-12" onClick={generateUpsells} disabled={isGeneratingUpsells}>
            Generate AI Upsell Analysis
          </Button>

          {revenueProtocol && (
            <div className="space-y-4">
               <h4 className="font-black uppercase text-xs tracking-widest text-white/60">Recommended Strategies</h4>
               <div className="grid gap-4">
                 {recommendations.map((rec, i) => (
                   <Card key={i} className="bg-white/5 border-white/10">
                     <CardContent className="p-4">
                       <p className="font-bold text-white text-sm">{rec.serviceName}</p>
                       <p className="text-[10px] text-white/40">{rec.reason}</p>
                       <p className="text-primary font-black mt-2">{formatCurrency(rec.bundlePrice)}</p>
                     </CardContent>
                   </Card>
                 ))}
               </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
