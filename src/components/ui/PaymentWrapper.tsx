import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { StripePayment } from "./StripePayment";
import { toast } from "sonner";

const getStripeKey = () => {
  const key = (import.meta.env.VITE_STRIPE_PUBLIC_KEY || "").trim();
  if (key && !key.startsWith('pk_')) {
    console.warn("Invalid Stripe Publishable Key: Frontend keys must start with 'pk_'. Found prefix: " + key.substring(0, 3));
    return "";
  }
  return key;
};

const stripePromise = loadStripe(getStripeKey());

export const PaymentSection: React.FC<{amount: number, metadata?: Record<string, string>, onPaymentSuccess: (id: string) => void}> = ({amount, metadata, onPaymentSuccess}) => {
  return (
    <Elements stripe={stripePromise}>
      <StripePayment 
        amount={amount} 
        metadata={metadata} 
        onSuccess={onPaymentSuccess} 
        onError={(err) => {
          console.error("Payment section error:", err);
          toast.error(err);
        }} 
      />
    </Elements>
  );
};
