import React from "react";
import { format } from "date-fns";
import { Invoice, Quote, BusinessSettings, LineItem } from "../types";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";
import { FileText, Receipt, Phone, Mail, MapPin, Calendar, Clock } from "lucide-react";

interface DocumentPreviewProps {
  document: Partial<Invoice | Quote>;
  settings: BusinessSettings | null;
  type: "invoice" | "quote";
}

export function DocumentPreview({ document, settings, type }: DocumentPreviewProps) {
  const isInvoice = type === "invoice";
  const docNumber = document.id ? document.id.slice(-6).toUpperCase() : "PREVIEW";
  const date = document.createdAt ? (document.createdAt as any).toDate?.() || new Date() : new Date();
  
  const subtotal = document.lineItems?.reduce((acc, item) => acc + (item.price || 0), 0) || 0;
  const taxAmount = (subtotal * (settings?.taxRate || 0)) / 100;
  const total = subtotal + taxAmount;

  return (
    <div className="bg-gray-100 p-4 md:p-8 min-h-full flex justify-center">
      <Card className="w-full max-w-4xl bg-white shadow-2xl border-none overflow-hidden rounded-none md:rounded-xl">
        <CardContent className="p-0">
          {/* Header */}
          <div className="p-8 md:p-12 bg-white flex flex-col md:flex-row justify-between gap-8">
            <div className="space-y-4">
              {settings?.logoUrl && settings.showLogoOnDocuments !== false ? (
                <div className="h-16 w-auto flex items-start">
                  <img 
                    src={settings.logoUrl} 
                    alt="Logo" 
                    className="h-full object-contain" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-primary">
                  {isInvoice ? <Receipt className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
                  <span className="text-2xl font-black tracking-tighter uppercase">
                    {settings?.businessName || "Flatline Detail"}
                  </span>
                </div>
              )}
              <div className="space-y-1 text-sm text-gray-500 font-medium">
                <p className="text-gray-900 font-bold">{settings?.businessName}</p>
                {settings?.baseAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    <span>{settings.baseAddress}</span>
                  </div>
                )}
                {settings?.businessPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    <span>{settings.businessPhone}</span>
                  </div>
                )}
                {settings?.businessEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3" />
                    <span>{settings.businessEmail}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right space-y-2">
              <h2 className="text-4xl font-black tracking-tighter uppercase text-gray-900">
                {isInvoice ? "Invoice" : "Quote"}
              </h2>
              <div className="space-y-1">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                  {isInvoice ? "Invoice #" : "Quote #"}
                  <span className="text-gray-900 ml-2">{docNumber}</span>
                </p>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                  Date
                  <span className="text-gray-900 ml-2">{format(date, "MMM dd, yyyy")}</span>
                </p>
                {isInvoice && (document as Invoice).dueDate && (
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                    Due Date
                    <span className="text-gray-900 ml-2">
                      {format(((document as Invoice).dueDate as any).toDate?.() || new Date(), "MMM dd, yyyy")}
                    </span>
                  </p>
                )}
              </div>
              <Badge className={cn(
                "mt-4 uppercase font-black tracking-tighter px-4 py-1",
                document.status === "paid" || document.status === "approved" ? "bg-green-500" : "bg-amber-500"
              )}>
                {document.status || "Draft"}
              </Badge>
            </div>
          </div>

          <Separator className="bg-gray-100" />

          {/* Client & Vehicle Info */}
          <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Bill To</h3>
              <div className="space-y-1">
                <p className="text-xl font-black text-gray-900">{document.clientName}</p>
                {document.clientEmail && (
                  <div className="flex items-center gap-2 text-gray-500 font-medium">
                    <Mail className="w-3 h-3" />
                    <span>{document.clientEmail}</span>
                  </div>
                )}
                {document.clientPhone && (
                  <div className="flex items-center gap-2 text-gray-500 font-medium">
                    <Phone className="w-3 h-3" />
                    <span>{document.clientPhone}</span>
                  </div>
                )}
                {document.clientAddress && (
                  <div className="flex items-center gap-2 text-gray-500 font-medium">
                    <MapPin className="w-3 h-3" />
                    <span>{document.clientAddress}</span>
                  </div>
                )}
              </div>
            </div>

            {document.vehicles && document.vehicles.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Vehicle Info</h3>
                <div className="space-y-3">
                  {document.vehicles.map((v, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Clock className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{v.year} {v.make} {v.model}</p>
                        {v.roNumber && (
                          <p className="text-[10px] font-black uppercase text-primary">RO: {v.roNumber}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="px-8 md:px-12 pb-12">
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">Description</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 text-center">Qty</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 text-right">Price</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {document.lineItems?.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900">{item.serviceName}</p>
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-gray-500">1</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-500">
                        ${(item.price || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900">
                        ${(item.price || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-8 flex justify-end">
              <div className="w-full md:w-80 space-y-3">
                <div className="flex justify-between text-sm font-medium text-gray-500">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm font-medium text-gray-500">
                    <span>Tax ({settings?.taxRate}%)</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <Separator className="bg-gray-100" />
                <div className="flex justify-between items-center pt-2">
                  <span className="text-lg font-black uppercase tracking-tighter text-gray-900">Total</span>
                  <span className="text-3xl font-black tracking-tighter text-primary">
                    ${total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer / Notes */}
          <div className="p-8 md:p-12 bg-gray-50/50 border-t border-gray-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Terms & Conditions</h3>
                <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                  Payment is due within the specified timeframe. A late fee of {settings?.travelPricing?.minTravelFee || "$25"} may apply to overdue invoices. 
                  Cancellations within 24 hours may be subject to a fee. Thank you for your business!
                </p>
              </div>
              <div className="flex flex-col justify-end items-end">
                <p className="text-sm font-black text-gray-900 uppercase tracking-tighter">Thank you for choosing</p>
                <p className="text-lg font-black text-primary uppercase tracking-tighter">{settings?.businessName}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
