export type NormalizedPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type PaymentRuntimeConfig = {
  provider: string;
  credentials: Readonly<Record<string, string>>;
  sandbox: boolean;
  vaultRevision?: string;
};

export type PaymentContext = {
  provider: string; attemptId: string; orderId: string; amountRial: number; currency: "IRR";
};

export type CallbackInput = { authority: string; accepted: boolean };
export type PaymentHealth = {
  status: "configured" | "unavailable";
  scope: "configuration";
  message: string;
};

export interface PaymentAdapter {
  id: string;
  createPayment(input: PaymentContext & {
    callbackUrl: string; description: string; email: string; mobile: string;
  }, config: PaymentRuntimeConfig): Promise<{ status: "pending"; authority: string; redirectUrl: string }>;
  verifyPayment(input: PaymentContext & { authority: string }, config: PaymentRuntimeConfig): Promise<
    PaymentContext & { status: "paid"; authority: string; reference: string }
  >;
  handleCallback(params: URLSearchParams): CallbackInput | null;
  redirectUrl(authority: string, config: PaymentRuntimeConfig): string;
  healthCheck(config: PaymentRuntimeConfig): Promise<PaymentHealth>;
  refund?(input: PaymentContext & { reference: string }, config: PaymentRuntimeConfig): Promise<{
    status: "refunded"; reference: string;
  }>;
}
