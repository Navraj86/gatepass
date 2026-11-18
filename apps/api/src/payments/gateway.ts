import { config } from "../config.js";
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

/**
 * LOAD_TEST swaps Dodo for a stub so a load test measures Gatepass, not a
 * provider's test-mode limits. The payment id is derived from the order id,
 * so k6 can sign the matching payment.succeeded webhook itself.
 */
export function createLoadTestGateway(): PaymentGateway {
  return {
    async createCheckout({ orderId }) {
      return {
        sessionId: `cks_load_${orderId}`,
        paymentId: `pay_load_${orderId}`,
        checkoutUrl: `${config.APP_URL}/checkout/return?order=${orderId}`,
      };
    },
    async refund({ orderId }) {
      return { status: "requested", refundId: `ref_load_${orderId}` };
    },
  };
}

let current: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  current ??= config.LOAD_TEST ? createLoadTestGateway() : createDodoGateway();
  return current;
}

export function setPaymentGateway(gateway: PaymentGateway) {
  current = gateway;
}
