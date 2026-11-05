import { createDodoGateway } from "./dodo.js";

export type CreateCheckoutInput = {
  orderId: string;
  amountMinor: number;
  customer: { email: string; name: string };
  billing: { country: string; zipcode: string };
};

export type CreateCheckoutResult = { sessionId: string; paymentId: string; checkoutUrl: string };

export type RefundResult = { status: "requested"; refundId: string } | { status: "already_requested" };

export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  refund(input: { paymentId: string; orderId: string; reason: string }): Promise<RefundResult>;
}

let current: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  current ??= createDodoGateway();
  return current;
}

export function setPaymentGateway(gateway: PaymentGateway) {
  current = gateway;
}