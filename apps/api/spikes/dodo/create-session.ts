import { dodo } from "./client.js";

const session = await dodo.checkoutSessions.create({
  product_cart: [{ product_id: process.env.DODO_PRODUCT_ID!, quantity: 1, amount: 3000 }],
  customer: { email: "spike@example.com", name: "Spike Tester" },
  billing_address: { country: "IN", zipcode: "151001" },
  minimal_address: true,
  confirm: true,
  return_url: "http://localhost:4000/checkout/success",
  cancel_url: "http://localhost:4000/checkout/cancel",
  metadata: { order_id: `spike-${Date.now()}` },
});

console.log(JSON.stringify(session, null, 2));
