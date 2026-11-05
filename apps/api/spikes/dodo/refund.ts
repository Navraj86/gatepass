import { dodo } from "./client.js";

const paymentId = process.argv[2];
const refund = await dodo.refunds.create({ payment_id: paymentId, reason: "Gatepass spike test" });
console.log(JSON.stringify(refund, null, 2));
