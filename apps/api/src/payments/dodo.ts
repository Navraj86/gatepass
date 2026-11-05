import DodoPayments from "dodopayments";
import { requireEnv } from "../config.js";
import type { PaymentGateway } from "./gateway.js";

type CheckoutParams = Parameters<DodoPayments["checkoutSessions"]["create"]>[0];
type Country = NonNullable<CheckoutParams["billing_address"]>["country"];

export function createDodoGateway(): PaymentGateway {
  const client = new DodoPayments({
    bearerToken: requireEnv("DODO_PAYMENTS_API_KEY"),
    environment: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
  });
  const productId = requireEnv("DODO_PRODUCT_ID");
  const appUrl = requireEnv("APP_URL");

  return {
    async createCheckout({ orderId, amountMinor, customer, billing }) {
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1, amount: amountMinor }],
        customer: { email: customer.email, name: customer.name },
        billing_address: { country: billing.country as Country, zipcode: billing.zipcode },
        minimal_address: true,
        confirm: true,
        return_url: `${appUrl}/checkout/return?order=${orderId}`,
        cancel_url: `${appUrl}/checkout/cancel?order=${orderId}`,
        metadata: { order_id: orderId },
      });
      if (!session.payment_id || !session.checkout_url) {
        throw new Error("Dodo session is missing payment_id or checkout_url");
      }
      return {
        sessionId: session.session_id,
        paymentId: session.payment_id,
        checkoutUrl: session.checkout_url,
      };
    },

    async refund({ paymentId, orderId, reason }) {
      try {
        const refund = await client.refunds.create({
          payment_id: paymentId,
          reason,
          metadata: { order_id: orderId },
        });
        return { status: "requested", refundId: refund.refund_id };
      } catch (err) {
        const code = (err as { error?: { code?: string } }).error?.code;
        if (code === "PAYMENT_ALREADY_REFUNDED" || code === "EXISTING_REFUND_REQUEST_PROCESSING") {
          return { status: "already_requested" };
        }
        throw err;
      }
    },
  };
}