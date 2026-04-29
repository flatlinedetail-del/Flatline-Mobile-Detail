import React, { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";

interface StripePaymentProps {
  amount: number;
  metadata?: Record<string, string>;
  onSuccess: (transactionId: string) => void;
  onError: (error: string) => void;
}

export const StripePayment: React.FC<StripePaymentProps> = ({ amount, metadata, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event?: React.MouseEvent | React.FormEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!stripe || !elements) {
      const msg = "Stripe has not initialized yet. Please wait.";
      console.error(msg);
      toast.error(msg);
      return;
    }

    if (!amount || amount <= 0) {
      const msg = "Invalid payment amount. Selection required.";
      console.warn(msg, amount);
      toast.error(msg);
      return;
    }

    setLoading(true);
    const loadingToast = toast.loading("Processing secure deposit...");

    try {
      console.log(`Creating payment intent for $${amount}...`);
      const response = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: Number(amount), 
          metadata: {
            ...metadata,
            source: 'booking_deposit',
            timestamp: new Date().toISOString()
          } 
        }),
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Invalid non-JSON response from server: ${response.status} - ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(responseData.error || `Server error: ${response.status}`);
      }

      let { clientSecret, error } = responseData;
      if (error) throw new Error(error);
      
      console.log("Response JSON clientSecret type:", typeof clientSecret, "value:", clientSecret ? clientSecret.substring(0, 10) + "..." : "null/undefined");
      
      if (!clientSecret || typeof clientSecret !== 'string' || !clientSecret.includes('_secret_')) {
        throw new Error("Invalid client secret format received from server.");
      }

      clientSecret = clientSecret.trim();

      console.log("Intent created successfully. Authenticating with card details...");
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Electronic payment element not found.");

      console.log("Calling confirmCardPayment with secret:", clientSecret);
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { 
          card: cardElement
        },
      });

      if (result.error) throw new Error(result.error.message);
      
      console.log("Payment successful:", result.paymentIntent!.id);
      toast.success("Deposit confirmed successfully", { id: loadingToast });
      onSuccess(result.paymentIntent!.id);
    } catch (err: any) {
      console.error("Payment failed stack:", err.stack);
      console.error("Payment failed message:", err.message);
      toast.error(err.message || "Payment failed", { id: loadingToast });
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="stripe-payment-container" className="p-5 bg-zinc-900/50 rounded-2xl border border-white/10 mt-2">
      <div className="mb-4">
        <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">
          Secure Payment Details
        </label>
        <div className="p-4 bg-black/40 border border-white/10 rounded-xl">
          <CardElement 
            options={{
              style: {
                base: {
                  fontSize: '14px',
                  color: '#ffffff',
                  '::placeholder': {
                    color: '#a1a1aa',
                  },
                },
              },
            }}
          />
        </div>
      </div>
      
      <button 
        id="pay-deposit-button"
        type="button"
        onClick={handleSubmit}
        disabled={loading || !stripe} 
        className="w-full bg-primary hover:bg-red-700 text-white h-12 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Verifying...
          </>
        ) : (
          `Pay Deposit: $${amount.toFixed(2)}`
        )}
      </button>
      <p className="text-[9px] text-white/20 text-center mt-3 font-medium flex items-center justify-center gap-1">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
        Encrypted via Stripe 256-bit SSL
      </p>
    </div>
  );
};
