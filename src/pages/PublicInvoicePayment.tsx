import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Invoice } from "../types";
import { formatCurrency } from "@/lib/utils";
import { PaymentSection } from "../components/ui/PaymentWrapper";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function PublicInvoicePayment() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!invoiceId) return;
      try {
        const snap = await getDoc(doc(db, "invoices", invoiceId));
        if (snap.exists()) {
          setInvoice({ id: snap.id, ...snap.data() } as Invoice);
        }
      } catch (e) {
        toast.error("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [invoiceId]);

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="animate-spin w-8 h-8" /></div>;
  if (!invoice) return <div className="text-center mt-10">Invoice not found.</div>;
  if (invoice.paymentStatus === 'paid') return <div className="text-center mt-10 font-bold text-green-600">Invoice already paid.</div>;

  const remainingBalance = invoice.total - (invoice.paidAmount || 0);

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Pay Invoice {invoice.invoiceNumber}</h1>
      <div className="bg-white p-4 rounded shadow">
        <p>Total: {formatCurrency(invoice.total)}</p>
        <p className="font-bold">Remaining Balance: {formatCurrency(remainingBalance)}</p>
      </div>
      <PaymentSection 
        amount={remainingBalance} 
        metadata={{ invoiceId: invoice.id, businessId: invoice.businessId, type: 'invoice' }}
        onPaymentSuccess={async (transactionId) => {
           // Call backend to update invoice status
           const response = await fetch("/api/payments/confirm-invoice", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ paymentIntentId: transactionId, invoiceId: invoice.id, businessId: invoice.businessId })
           });
           if (response.ok) {
             toast.success("Payment successful!");
             setInvoice({...invoice, paymentStatus: 'paid'});
           } else {
             toast.error("Payment recorded but failed to update status");
           }
        }}
      />
    </div>
  );
}
