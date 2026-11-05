| # | Question | Answer |
|---|---|---|
| 1 | Amount override with confirm: true | Works. $30 (3000 cents) was used, converted to INR for an Indian billing address, with 18% tax added on top: buyer paid ₹3,478.38 |
| 2 | payment_id at creation = webhook payment_id? | Yes, identical |
| 3 | payment.succeeded contents | payment_id, checkout_session_id, metadata.order_id present. total_amount and tax in buyer currency (INR paise). settlement_amount and settlement_tax in USD cents; settlement_amount minus settlement_tax equals our amount |
| 4 | Unpaid session | No webhook at all. Return URL shows status=requires_payment_method |
| 5 | Declined card | payment.failed with error_code PAYMENT_METHOD_UNSUPPORTED (foreign card on an Indian checkout). Return URL gets status=failed. Retried with new sessions; same-session retry not tested |
| 6 | Refund | Full refund of the buyer's total including tax. Failed first with 409 INSUFFICIENT_WALLET_FUNDS: refunds come from the wallet balance, which is lower than the payment after tax and fees. refund.succeeded has payment_id, empty metadata unless passed |
| 7 | webhook-id on replay | Not tested. Design does not rely on it: duplicates are handled by state-checked updates |

## Surprises

- Test cards must match the billing country. US cards fail on Indian checkouts
- Return URL status is used for every outcome and is not trustworthy; the return page must ask our API
- Refunds can fail when the wallet balance is low, and Dodo does not return fees on refunds
- PWYW products must be priced in USD, GBP or EUR, so Gatepass prices are in USD

## What changes in the plan

- Orders store charged amount, currency and tax from the webhook
- Webhook verifies settlement_amount minus settlement_tax equals the order amount
- payment.failed marks the order failed but keeps holds, so the buyer can retry with a new order
- Abandoned checkouts are handled only by hold expiry
- Refund failures leave the order in refunding with a retry option
- Spike payloads become signed test fixtures