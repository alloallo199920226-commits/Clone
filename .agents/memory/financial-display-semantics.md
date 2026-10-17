---
name: Financial display semantics
description: Preserve the difference between settled funds, pending requests, purchases, and actual earnings.
---

Keep pending deposit/withdrawal requests separate from the settled financial ledger. A pending request must not change the balance or appear as a verified payment.

**Why:** the supplied history references include pending deposits, but the balance is calculated from the ledger. Treating a pending request as a ledger entry would misrepresent funds received.

**How to apply:** a future manual-payment flow needs separate request storage and an explicit verification/approval step before a settled entry is recorded.

Purchase cost is not earned income. Withdrawal net amounts and product earnings must come from verified stored facts, not calculations based on advertised percentages or screenshot values.

**Why:** the reference has separate purchase-price, earned-income, and amount-received figures; silently calculating one from another would present unsupported financial information.

**How to apply:** display unknown financial facts as “—”. Report per-level commissions only when settled commissions can actually be attributed to members at those levels; do not distribute an unallocated total using advertised rates.
