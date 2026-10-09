# Model card — Explainable deal assessment

**System:** LTV Desking PRO · **Current component:** `services/dealAssessment.ts` · **Version:** `rules-v1`, reviewed 2026-10-08. **Status:** internal finance-desking companion; no approval probability or credit decision is produced.

## Purpose and permitted interpretation

The visible deal-readiness rating counts explicit checks. It helps dealership staff identify missing inputs, infeasible entered structures, payment-budget tradeoffs and estimated dealer gross. It does not approve, decline, offer, price or rank consumers. Lenders make actual credit decisions after their application process. A program failing configured rules is **No fit**, not a lender denial.

A rating of 100 means all twelve configured checks passed. It does not certify the underlying evidence, taxes, legal compliance, funding or suitability. Do not communicate it as a probability of approval, financial advice, or a funded offer.

## Inputs and formulas

Inputs are manually entered or imported vehicle price/book, FICO, gross monthly income, existing monthly obligations, explicit new/used/certified condition per VIN, payment term/rate, down payment, trade allowance/payoff, rebates, fees, products, budget and manager-confirmed profit inputs. No bureau pull is performed. No demographic attribute is read by the assessment; this does not establish absence of proxy risk or fair-lending compliance.

| Measure                  | Calculation and interpretation                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness                | Passed checks / 12, rounded to whole percent. Missing and failed checks receive zero points.                                                       |
| Completeness             | Resolved checks / 12. A resolved failure is complete but does not pass.                                                                            |
| Lender match             | Fitting fully checked, non-sample programs / fully checked, non-sample programs. Show denominator and pending count. No denominator means unknown. |
| Budget used / headroom   | Estimated monthly payment / customer-entered ceiling; ceiling minus payment. No universal affordability threshold is implied.                      |
| PTI / DTI                | Payment / gross monthly income; (existing monthly obligations + proposed payment) / gross income. Enforce only configured program constraints.     |
| Estimated total interest | Cents-rounded payment × term minus amount financed. Excludes finance-charge fees and payment-timing differences.                                   |
| Front gross              | Selling price after dealer discount minus manager-confirmed all-in VIN cost. Imported acquisition cost alone does not establish all-in cost.       |
| Product gross            | Product selling amount minus entered product cost. No products means zero.                                                                         |
| Estimated total gross    | Front gross + product gross + explicitly entered reserve/flat. No reserve is inferred from rate spread. Excludes later chargebacks and overhead.   |
| Gross target             | Estimated gross / entered positive minimum gross; dollar headroom is available with an explicit zero target.                                       |

The twelve checks are: vehicle pricing/book; FICO; income; obligations; condition; payment calculation; configured program match; payment budget; all-in VIN cost; product cost; reserve; gross target. Blank values are unknown; an explicit zero debt, reserve or product amount can be valid. Readiness combines customer inputs and dealer financial checks, so it is a workflow checklist, not a pure measure of customer affordability.

Pareto comparison considers only structures passing all twelve checks. A unit dominates another only when payment and estimated interest are no higher, estimated gross is no lower, and at least one dimension improves. It describes those three dimensions only: features, condition, preferences, warranty coverage and future resale value are not measured. It must not be presented as the objectively best vehicle for a customer.

## Program matching safeguards

`services/lenderMatcher.ts` checks configured constraints and returns Fit, Pending or No fit. Missing required facts, samples, AI range-review holds, certified-status checks and undefined lender-specific advance calculations remain pending. Missing financed amount is pending; a known nonpositive amount cannot be financed.

A published base rate plus rate adder is a program floor. A lower entered quote does not count as a fit; otherwise PTI/DTI would be checked using an artificially low payment. A missing quote remains pending when the program publishes a rate. Explicit 0% programs are valid. Private buy-rate values are not included in public failure reasons.

This guard applies when the client has the published rate. Sales profiles redact private buy-rate fields; the server supplies only `rateCheckRequired: true` on tiers whose private rate must be checked. Those tiers stay Pending for manager review instead of bypassing the rate floor. Managers with the published rate evaluate the actual floor. An absent rate is not inferred or invented, and no private rate value is added to the sales signal.

An entered effective date must be a real ISO calendar date (`YYYY-MM-DD`). Future programs and malformed dates remain pending. A past effective date is not an expiry date: the engine does not invent one. Imported and edited programs require human source review; source document/version, review timestamp and optional inclusive expiration are stored. Expired or malformed expiration dates remain pending. The timestamp records the dealer action, not independent verification by the lender. A non-sample program with enforceable constraints is counted as configured evidence; that alone does not establish lender-authoritative verification or freshness.

LTV uses each lender's selected Trade or Retail book with no cross-book fallback. The general inventory display prefers Trade and falls back to Retail. The vehicle data currently stores two numbers without authoritative guide/version/date/options provenance. Explicit new, used and certified condition is stored per VIN; certified counts as used unless a program requires certified specifically. Missing condition stays pending for restricted programs. Lender-specific `maxAdvance` calculations remain unchecked without their authoritative basis.

## Saved ratings and role boundaries

Saved ratings carry a validated `rules-v1` snapshot. Reopening recalculates against current inputs/programs. Legacy `approvalScore` and `approvalBand` fields can still be computed or persisted for compatibility; they must never be relabelled as readiness or treated as probabilities. Current inventory sorting/filtering and visible ratings use the checklist.

Sales cannot read or write manager profit inputs. Sales financial edits preserve those private values and invalidate private assessment snapshots. Customer/internal PDFs omit costs, gross and the legacy score. See `docs/desking/deal-ratings.md` and role-boundary tests for the persisted contract.

## Finance and geographic limitations

The amortization estimate assumes equal monthly payments and entered nominal annual rate. The desk and worksheets label the input interest rate; legacy field names still use APR for compatibility. The engine does not compute disclosure APR including credit-related fees, odd first-payment dates or daily accrual. The worksheets are preliminary internal estimates, not completed Truth-in-Lending disclosures.

The tax engine models a **Michigan dealer**, with modeled MI/OH/IN/IL/FL buyer states and Michigan reciprocal collection. It is not a national dealer tax engine. Delivery outside Michigan, exempt/nonreciprocal states, local home-state liabilities, leases and state-specific product/fee taxation require additional verified jurisdiction rules. A single custom rate does not supply those rules. Vehicle condition and manual overrides are scoped to each VIN, including restored legacy deals; import feeds without condition do not invent or replace an existing confirmation. The nationwide jurisdiction limitations above still apply.

Printed deal worksheets are internal-use unless they carry the full Truth-in-Lending companion disclosures. The print footer remains: **Internal use only. Printed deal worksheets are internal-use unless they carry the full Truth-in-Lending companion disclosures.**

## Validation and launch evidence

Formula/edge cases: `services/dealAssessment.test.ts`, `services/calculator.test.ts`, `services/lenderMatcher.test.ts`, `services/lenderFit.test.ts`. Persistence and roles: `tests/e2e/deal-ratings.spec.ts`, `tests/e2e/field-visibility.spec.ts`. Test passage proves the tested behavior; it does not certify every lender rule or jurisdiction.

Before broader sale, follow the independent-dealer pilot in `docs/PILOT_CHARTER.md`: reconcile estimates against real funded contract payments and explain deltas. Track sample counts, program/document versions and jurisdiction coverage. The charter's ≤$10/month on ≥80% of sampled deals is a pilot success target, not evidence already achieved or a universal acceptance threshold. The legacy heuristic is uncalibrated; there are no validated lender approval probabilities.

Update this card and `deal-ratings.md` when checklist definitions, matching rules, role visibility or finance/tax scope change. Product/legal review must establish permitted consumer-facing use and disclosures before changing internal worksheets into customer offers.
