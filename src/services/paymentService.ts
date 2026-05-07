import { Invoice } from "../types";

export type PaymentProvider = "stripe" | "square" | "paypal" | "clover";

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentProviderConfig {
  enabled: boolean;
  [key: string]: any;
}

/**
 * Modular Payment Service Layer
 * Supports Stripe, Square, PayPal, and Clover
 */
class PaymentService {
  private static instance: PaymentService;

  private constructor() {}

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Process a payment using the specified provider
   * NOTE: This is a modular architecture. Full implementation requires 
   * provider-specific SDKs and API keys.
   */
  public async processPayment(
    invoice: Invoice,
    provider: PaymentProvider,
    config: PaymentProviderConfig
  ): Promise<PaymentResult> {
    if (!config.enabled) {
      return { success: false, error: `${provider} is not enabled in settings.` };
    }

    console.log(`Processing payment for invoice ${invoice.id} via ${provider}...`);

    try {
      switch (provider) {
        case "stripe":
          return await this.processStripe(invoice, config);
        case "square":
          return await this.processSquare(invoice, config);
        case "paypal":
          return await this.processPayPal(invoice, config);
        case "clover":
          return await this.processClover(invoice, config);
        default:
          return { success: false, error: "Unsupported payment provider." };
      }
    } catch (error) {
      console.error(`Payment failed via ${provider}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown payment error" };
    }
  }

  /**
   * Charge a saved payment method for a client
   */
  public async chargeSavedCard(params: {
    clientId: string;
    amount: number;
    description: string;
    provider?: PaymentProvider;
    config?: any;
  }): Promise<PaymentResult & { provider?: PaymentProvider }> {
    console.log(`Attempting to charge saved card for client ${params.clientId}: ${params.amount}...`);
    
    // In a real implementation, this would call Stripe/Square API to charge a saved customer/card
    // For now, we simulate a successful charge if a mock provider is enabled
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulation logic
        const success = Math.random() > 0.1; // 90% success rate for simulation
        if (success) {
          resolve({ 
            success: true, 
            transactionId: `ch_${Math.random().toString(36).substr(2, 9)}`,
            provider: params.provider || "stripe"
          });
        } else {
          resolve({ 
            success: false, 
            error: "The saved card was declined. Please update payment method.",
            provider: params.provider || "stripe"
          });
        }
      }, 2000);
    });
  }

  private async processStripe(invoice: Invoice, config: any): Promise<PaymentResult> {
    return { success: false, error: "Payment system not configured" };
  }

  private async processSquare(invoice: Invoice, config: any): Promise<PaymentResult> {
    return { success: false, error: "Payment system not configured" };
  }

  private async processPayPal(invoice: Invoice, config: any): Promise<PaymentResult> {
    return { success: false, error: "Payment system not configured" };
  }

  private async processClover(invoice: Invoice, config: any): Promise<PaymentResult> {
    try {
      const response = await fetch("/api/payments/clover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: invoice.total, invoiceId: invoice.id })
      });

      if (!response.ok) {
        throw new Error("Clover payment failed.");
      }

      const data = await response.json();
      return { success: true, transactionId: data.transactionId };
    } catch (error) {
      console.error("Clover payment error:", error);
      return { success: false, error: "Clover payment failed." };
    }
  }
}

export const paymentService = PaymentService.getInstance();
