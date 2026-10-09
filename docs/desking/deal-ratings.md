# Explainable deal ratings (`rules-v1`)

The desk measures entered facts and configured lender constraints. It does not predict a credit approval probability. The lender makes the actual credit decision. Sample programs remain pending until their real terms are verified; fictional rates must never be presented as genuine lender offers.

| Number         | Meaning                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deal readiness | Passed checks / 12, rounded to a whole percent. Missing and failed checks earn no points.                                                                                    |
| Data complete  | Resolved checks / 12, including failures. A fully entered, unaffordable deal can be 100% complete and below 100% ready.                                                      |
| Lender match   | Fully checked fitting programs / fully checked programs. Display the denominator and pending count separately; exclude samples and programs without enforceable constraints. |
| Budget used    | Estimated payment / customer's entered monthly ceiling × 100. Headroom = ceiling − payment.                                                                                  |
| PTI / DTI      | Payment / gross income; (existing monthly debt + payment) / gross income. No universal pass threshold is invented; configured lender limits apply.                           |
| Total interest | Cents-rounded payment × term − amount financed. This is an estimate, excluding later fees and payment timing changes.                                                        |
| Front gross    | Selling price after dealer discount − manager-confirmed all-in VIN cost. Manufacturer rebates affect financing, not dealer-discount gross.                                   |
| Product gross  | Product retail amount − entered product cost. No products means zero product gross.                                                                                          |
| Total gross    | Front gross + product gross + explicitly entered expected reserve/flat. No reserve is inferred from rate markup. Excludes overhead and later chargebacks.                    |
| Gross target   | Total gross / manager-entered minimum gross × 100. A zero target has dollar headroom but no meaningful percentage.                                                           |

The fixed twelve checks cover vehicle pricing/book, FICO, income, monthly obligations, condition, payment calculation, verified program match, customer payment budget, all-in unit cost, product cost, reserve estimate, and gross target. An explicit zero debt or reserve is valid. Blank means unknown. Imported acquisition cost is only a hint, not a confirmed all-in cost.

Pareto comparison considers only deals passing all twelve checks. Another unit dominates a candidate only if it has no higher payment, no higher estimated interest and no lower estimated gross, with at least one strict improvement. This exposes tradeoffs without opaque weights. Incomplete units are not declared inferior.

Saved ratings carry a validated `rules-v1` snapshot. Historical structure indices remain legacy values and are not relabelled as readiness. Reopening a deal recalculates against current programs and restores its saved budget and VIN-specific costs. Sales cannot read or write manager profit inputs; financial edits by sales preserve private costs and invalidate the private saved assessment. Customer PDFs omit internal costs and gross.

Implementation: `services/dealAssessment.ts`. Formula and edge-case tests: `services/dealAssessment.test.ts`. Real persistence, responsive panels and role boundaries: `tests/e2e/deal-ratings.spec.ts` and `tests/e2e/field-visibility.spec.ts`.

## Program and jurisdiction boundaries

A quoted rate below a known published base rate plus adder does not count as a program fit. Missing quotes remain pending when the program publishes a rate; an actual 0% program is valid. Missing financed amount stays pending, rather than being presented as a completed failure. Enter effective dates as `YYYY-MM-DD`: malformed or future dates hold a program pending. Past effective dates do not establish expiry or source verification.

The tax calculator models a Michigan dealer with MI/OH/IN/IL/FL buyers, not dealers nationwide. Readiness does not establish authoritative tax, source-document authenticity, book-date, stipulation completion or funding verification. A 100% checklist is twelve configured checks passed, not a lender approval or national compliance certificate. Book values lack guide/version/options provenance; new/used/certified condition and manual overrides are scoped per VIN. Imported or edited programs stay pending for source review; supplied expiration dates are enforced, while a blank expiry remains unknown. See `docs/MODEL_CARD.md` for these limitations and the distinction between estimated nominal-rate payments and disclosure APR.
