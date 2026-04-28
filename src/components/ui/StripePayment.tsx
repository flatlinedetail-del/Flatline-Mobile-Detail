import React, { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);

    try {
      const response = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, metadata }),
      });
      const { clientSecret, error } = await response.json();
      if (error) throw new Error(error);

      const cardElement = elements.getElement(CardElement);
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement! },
      });

      if (result.error) throw new Error(result.error.message);
      onSuccess(result.paymentIntent!.id);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded-lg border border-gray-200">
      <CardElement className="p-3 border rounded mb-4" />
      <button 
        disabled={loading || !stripe} 
        className="w-full bg-black text-white p-2 rounded hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Processing..." : `Pay Deposit`}
      </button>
    </form>
  );
};
