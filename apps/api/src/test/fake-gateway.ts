import type { CreateCheckoutInput, PaymentGateway } from "../payments/gateway.js";

export function createFakeGateway() {
  const sessions: CreateCheckoutInput[] = [];
  const refunds: { paymentId: string; orderId: string }[] = [];
  let failing = false;

  const gateway: PaymentGateway = {
    async createCheckout(input) {
      if (failing) {
        throw new Error("Payment provider is down");
      }
      sessions.push(input);
      const n = sessions.length;
      return { sessionId: `cks_test_${n}`, paymentId: `pay_test_${n}`, checkoutUrl: `https://checkout.test/${n}` };
    },
    async refund(input) {
      refunds.push(input);
      return { status: "requested", refundId: `ref_test_${refunds.length}` };
    },
  };

  return { gateway, sessions, refunds, setFailing: (value: boolean) => { failing = value; } };
}