import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { StripePayment } from "./StripePayment";

// This is where stripePromise should be defined. Assuming environment variable exists.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "");

export const PaymentSection: React.FC<{amount: number, metadata?: Record<string, string>, onPaymentSuccess: (id: string) => void}> = ({amount, metadata, onPaymentSuccess}) => {
  return (
    <Elements stripe={stripePromise}>
      <StripePayment amount={amount} metadata={metadata} onSuccess={onPaymentSuccess} onError={(err) => alert(err)} />
    </Elements>
  );
};
