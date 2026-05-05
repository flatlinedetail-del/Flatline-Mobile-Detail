import React from "react";
import { format } from "date-fns";
import { Invoice, Quote, BusinessSettings, LineItem } from "../types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { cn, cleanAddress, formatCurrency } from "@/lib/utils";
import { FileText, Receipt, Phone, Mail, MapPin, Calendar, Clock } from "lucide-react";

const cleanDescription = (rawContent: any) => {
  if (!rawContent) return "";
  if (typeof rawContent !== "string") return "Services were selected based on the vehicle condition, service needs, and requested work.";
  
  let cleaned = rawContent;
  
  if (cleaned.includes("[object Object]")) {
     return "Services were selected based on the vehicle condition, service needs, and requested work.";
  }

  cleaned = cleaned.replace(/\[[A-Z\s_]+\]/g, ""); // Remove tags like [REVENUE PROTOCOL]
  
  const badPhrases = ["optimized at", "revenue generation", "tactical routing", "internal log", "system id", "revenue protocol", "client strategy", "strategic opportunity"];
  const lines = cleaned.split('\n').map(l => l.trim()).filter((line: string) => {
      const lower = line.toLowerCase();
      if (!line) return false;
      return !badPhrases.some(b => lower.includes(b));
  }).join(' ');
  
  if (!lines || lines.length < 5) return "Service details were selected based on standard service procedures.";
  
  return lines;
};

interface DocumentPreviewProps {
  document: Partial<Invoice | Quote>;
  settings: BusinessSettings | null;
  type: "invoice" | "quote";
  onAddRecommendation?: (item: any) => void;
}

export function DocumentPreview({ document, settings, type, onAddRecommendation }: DocumentPreviewProps) {
  const isInvoice = type === "invoice";
  const docNumber = document.invoiceNumber || (document.id ? document.id.slice(-6).toUpperCase() : "PREVIEW");
  const date = document.createdAt ? (document.createdAt as any).toDate?.() || new Date() : new Date();
  
  const subtotal = document.subtotal ?? (document.lineItems?.reduce((acc: number, item: any) => acc + ((item.price || 0) * (item.quantity || 1)), 0) || 0);
  const discountAmount = document.discountAmount ?? 0;
  const travelFeeAmount = (document as any).travelFeeAmount ?? 0;
  const customFees = (document as any).customFees || [];
  const customFeesTotal = customFees.reduce((acc: number, f: any) => acc + (f.amount || 0), 0);
  const afterHoursFeeAmount = (document as any).afterHoursFeeAmount ?? 0;
  // Make sure tax calculation uses standard subtotal, but here we'll just use the total logic if we don't handle tax yet explicitly
  const taxAmount = ((subtotal - discountAmount) * (settings?.taxRate || 0)) / 100;
  const total = document.total ?? (subtotal - discountAmount + travelFeeAmount + afterHoursFeeAmount + customFeesTotal + taxAmount);

  const businessAddress = isInvoice ? "1 AMB Dr NW, Atlanta, GA 30313" : (settings?.invoiceAddress || settings?.baseAddress);
  // Ensure we NEVER use business address as service address
  const serviceAddress = document.serviceAddress || document.clientAddress || "Service address not recorded";

  const recommendedItems = isInvoice ? (document as Invoice).recommendedItems || [] : [];

  return (
    <div className="bg-gray-100 p-4 md:p-8 min-h-full flex justify-center">
      <Card className="w-full max-w-4xl bg-white shadow-2xl border-none overflow-hidden rounded-none md:rounded-xl">
        <CardContent className="p-0">
          {/* Header */}
          <div className="p-8 md:p-12 bg-white flex flex-col md:flex-row justify-between gap-8 border-b border-gray-100">
            <div className="space-y-4">
              {settings?.logoUrl && settings.showLogoOnDocuments !== false ? (
                <div className="h-16 w-48 flex items-start overflow-hidden">
                  <img 
                    src={settings.logoUrl} 
                    alt="Business Logo" 
                    className="h-full max-w-full object-contain transition-transform duration-75" 
                    style={{
                      transform: `translate(${settings.logoSettings?.x || 0}px, ${settings.logoSettings?.y || 0}px) scale(${settings.logoSettings?.scale || 1}) rotate(${settings.logoSettings?.rotation || 0}deg)`
                    }}
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#0A4DFF]">
                  <span className="text-2xl font-black tracking-tighter uppercase italic">
                    DETAIL<span className="text-slate-900">FLOW</span>
                  </span>
                </div>
              )}
              <div className="space-y-1 text-sm text-black font-medium">
                <p className="text-black font-bold">{settings?.businessName}</p>
                {businessAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-primary" />
                    <span>{cleanAddress(businessAddress)}</span>
                  </div>
                )}
                {settings?.businessPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-primary" />
                    <span>{settings.businessPhone}</span>
                  </div>
                )}
                {settings?.businessEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-primary" />
                    <span>{settings.businessEmail}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right space-y-2">
              <h2 className="text-4xl font-black tracking-tighter uppercase text-black">
                {isInvoice ? "Invoice" : "Quote"}
              </h2>
              <div className="space-y-1">
                <p className="text-sm font-bold text-black uppercase tracking-widest">
                  {isInvoice ? "Invoice #" : "Quote #"}
                  <span className="text-primary ml-2">{docNumber}</span>
                </p>
                <p className="text-sm font-bold text-black uppercase tracking-widest">
                  Date
                  <span className="text-black ml-2">{format(date, "MMM dd, yyyy")}</span>
                </p>
                {isInvoice && (document as Invoice).dueDate && (
                  <p className="text-sm font-bold text-black uppercase tracking-widest">
                    Due Date
                    <span className="text-black ml-2">
                      {format(((document as Invoice).dueDate as any).toDate?.() || new Date(), "MMM dd, yyyy")}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex justify-end mt-4">
                <Badge className={cn(
                  "uppercase font-black tracking-tighter px-4 py-1 border-none",
                  document.status === "paid" || document.status === "approved" ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
                )}>
                  {document.status || "Draft"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Client & Vehicle Form */}
          <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12 bg-gray-50/30">
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-black border-b-2 border-primary/20 pb-2">Bill To</h3>
                <div className="space-y-1">
                  <p className="text-xl font-black text-black">{document.clientName || "No customer name provided"}</p>
                  {document.businessName && document.businessName !== document.clientName && (
                    <p className="text-sm font-bold text-black uppercase tracking-widest">{document.businessName}</p>
                  )}
                  {document.clientEmail && (
                    <div className="flex items-center gap-2 text-black font-medium">
                      <Mail className="w-3 h-3 text-primary" />
                      <span>{document.clientEmail}</span>
                    </div>
                  )}
                  {document.clientPhone && (
                    <div className="flex items-center gap-2 text-black font-medium">
                      <Phone className="w-3 h-3 text-primary" />
                      <span>{document.clientPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-black border-b-2 border-primary/20 pb-2">Service Location</h3>
                <div className="flex items-start gap-2 text-black font-bold bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span className="text-sm">{cleanAddress(serviceAddress)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {document.vehicles && document.vehicles.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-black border-b-2 border-primary/10 pb-2">Vehicle Info</h3>
                  <div className="space-y-3">
                    {document.vehicles.map((v, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                        <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center">
                          <Clock className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-black">{v.year} {v.make} {v.model}</p>
                          {v.roNumber && (
                            <p className="text-[10px] font-black uppercase text-primary">RO: {v.roNumber}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {document.description && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-black border-b-2 border-primary/10 pb-2">Service Description</h3>
                  <div className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                    <p className="text-sm text-black leading-relaxed font-medium whitespace-pre-wrap">{cleanDescription(document.description)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="px-8 md:px-12 pb-8">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-black">Description</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-black text-center">Qty</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-black text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {document.lineItems?.map((item: any, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <p className="font-bold text-black">{item.serviceName}</p>
                        {item.description && (
                          <p className="text-[10px] text-black font-medium italic mt-1 leading-relaxed max-w-md">{cleanDescription(item.description)}</p>
                        )}
                        {item.bundledServiceNames && item.bundledServiceNames.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5 border-l-2 border-primary/20 pl-3">
                            {item.bundledServiceNames.map((bundleItemName: string, bIdx: number) => (
                              <div key={bIdx} className="flex justify-between items-center text-[10px] text-black/60 font-medium">
                                <span>- {bundleItemName}</span>
                                <span className="font-black uppercase tracking-widest text-primary/70">Included</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-black">{item.quantity || 1}</td>
                      <td className="px-6 py-5 text-right font-black text-black">
                        {formatCurrency((item.price || 0) * (item.quantity || 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recommended Services (Not accepted) */}
            {(recommendedItems.length > 0 || (isInvoice && (document as Invoice).unacceptedBundles?.length > 0)) && (
              <div className="mt-8 border border-amber-200/50 bg-amber-50/30 rounded-2xl p-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-4 flex items-center gap-2 border-b border-amber-200/50 pb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Recommended Services & Bundles (Not Billed)
                </h4>

                <div className="space-y-6 pt-2">
                  {isInvoice && (document as Invoice).unacceptedBundles?.map((bundle, idx) => (
                    <div key={`bundle-${idx}`} className="flex justify-between items-start gap-4 p-4 bg-white/50 border border-amber-200/30 rounded-xl">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-black uppercase tracking-tight">Bundle Opportunity: {bundle.name}</p>
                        </div>
                        <p className="text-[10px] text-black font-medium leading-relaxed mt-1">
                          Includes: {bundle.services?.join(" + ")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-black border border-black/10 px-2 py-0.5 rounded-md bg-black/5 block mb-1">Bundle Price: {formatCurrency(bundle.price)}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-green-600">You Save: {formatCurrency(bundle.savings)}</span>
                      </div>
                    </div>
                  ))}

                  {recommendedItems.length > 0 && (
                    <div className="space-y-4">
                      {recommendedItems.map((item, idx) => (
                        <div key={`rec-${idx}`} className="flex justify-between items-start gap-4 px-2">
                          <div>
                            <p className="text-sm font-bold text-black">{item.serviceName}</p>
                            <p className="text-[10px] text-black font-medium italic leading-relaxed mt-0.5">
                              {item.description ? cleanDescription(item.description) : "Recommended based on vehicle condition and maintenance needs"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end shrink-0 gap-2">
                            <div className="flex items-center gap-2">
                              {(item as any).bundlePrice && (item as any).originalPrice && ((item as any).originalPrice > (item as any).bundlePrice) && (
                                <span className="text-xs font-bold text-black/30 line-through mr-1">
                                  {formatCurrency((item as any).originalPrice)}
                                </span>
                              )}
                              <span className="text-xs font-bold text-black/60">{formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
                              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 border border-amber-600/20 px-2 py-0.5 rounded-md bg-amber-600/5">Not Added</span>
                            </div>
                            {(item as any).bundlePrice && (item as any).originalPrice && ((item as any).originalPrice > (item as any).bundlePrice) && (
                               <span className="text-[9px] font-black uppercase tracking-widest text-green-600">
                                 You Save: {formatCurrency(((item as any).originalPrice - (item as any).bundlePrice) * (item.quantity || 1))}
                               </span>
                            )}
                            {onAddRecommendation && (
                              <Button 
                                onClick={(e) => { e.stopPropagation(); onAddRecommendation(item); }}
                                className="h-7 text-[10px] font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white"
                              >
                                Add Recommended Service
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="mt-8 flex justify-end">
              <div className="w-full md:w-80 space-y-3 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                {subtotal > 0 && (
                  <div className="flex justify-between text-sm font-bold text-black">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm font-bold text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {travelFeeAmount > 0 && (
                  <div className="flex justify-between text-sm font-bold text-black">
                    <span>{settings?.serviceFeeLabel || "Travel Fee"}</span>
                    <span>{formatCurrency(travelFeeAmount)}</span>
                  </div>
                )}
                {customFees.length > 0 && customFees.map((fee: any, idx: number) => (
                  <div key={`doc-fee-${idx}`} className="flex justify-between text-sm font-bold text-black">
                    <span>{fee.label}</span>
                    <span>{formatCurrency(fee.amount)}</span>
                  </div>
                ))}
                {afterHoursFeeAmount > 0 && (
                  <div className="flex justify-between text-sm font-bold text-amber-600">
                    <span>After-Hours Fee</span>
                    <span>{formatCurrency(afterHoursFeeAmount)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm font-bold text-black">
                    <span>Tax ({settings?.taxRate}%)</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <Separator className="bg-black/10 my-2" />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-lg font-black uppercase tracking-tighter text-black">Total</span>
                  <span className="text-3xl font-black tracking-tighter text-primary font-heading">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer / Notes */}
          <div className="p-8 md:p-12 bg-white border-t border-gray-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-black">Terms & Conditions</h3>
                  <p className="text-[10px] text-black leading-relaxed font-medium">
                    Payment is due within the specified timeframe. A late fee of {settings?.travelPricing?.minTravelFee || "$25"} may apply to overdue invoices. 
                    Cancellations within 24 hours may be subject to a fee. Thank you for your business!
                  </p>
                </div>
                {isInvoice && (
                  <div className="space-y-2 pt-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-black">Payment Methods Accepted</h3>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <div className="px-3 py-1 bg-gray-50 border border-gray-100 rounded text-[9px] font-black uppercase tracking-widest text-black/60">Credit Card</div>
                      <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-[9px] font-black uppercase tracking-widest text-black/60">Debit Card</div>
                      <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-[9px] font-black uppercase tracking-widest text-black/60">Apple Pay</div>
                      <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-[9px] font-black uppercase tracking-widest text-black/60">Google Pay</div>
                      <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-[9px] font-black uppercase tracking-widest text-black/60">Cash / Zelle</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-end items-end">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">Powered by</p>
                <p className="text-lg font-black text-[#0A4DFF] uppercase tracking-tighter font-heading italic">DETAILFLOW</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
