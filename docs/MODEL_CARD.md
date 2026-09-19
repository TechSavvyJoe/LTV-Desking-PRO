# Model Card — Approval-Odds Score

**System:** LTV Desking PRO · **Component:** `services/approvalScorer.ts` (`APPROVAL_CONFIG`)
**Version:** config as of 2026-09-18 (weights 0.36 / 0.50 / 0.14, clamp 8–98) · **Owner:** product/engineering
**Status:** Internal desking aid. **Not** a credit decision, credit score, or offer of credit. **Not validated against observed approval outcomes.**

This card exists so a dealership's compliance officer, a lender partner, or counsel can understand exactly what the number on the gauge is, what it is not, and what controls surround it. It is written against the shipped code, not the design intent.

---

## 1. Purpose and scope

The approval-odds score is a **0–100 ranking heuristic** that helps a desk manager sort a lot of vehicles by how _structurally_ well a given deal fits the store's lender programs, and to see at a glance which lever (credit, advance, or affordability) is dragging a structure. It is shown to **dealership staff only**, on the internal desk, and is labeled on every surface as an estimate.

It is **not** used to approve, decline, price, or counter-offer any consumer, and it generates no adverse-action, risk-based-pricing, or disclosure artifact. Actual credit decisions are made by the lender after a real application.

## 2. Intended users and use

| Intended                                                                        | Not intended                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| F&I managers and desk managers ranking inventory for a structure                | Anyone communicating a "chance of approval" to a consumer |
| Sales staff seeing which units _fit_ (band + fit count), never buy-rate/reserve | Any automated decision, gate, or routing without a human  |
| Founder / QA tuning the config against real approval data                       | Prescreening, solicitation, or any FCRA-regulated use     |

## 3. Inputs

All inputs are entered by dealership staff on the desk. **No credit bureau data is ingested** — the FICO is typed by hand from a score the store already obtained. **No protected-class attribute** (race, color, religion, national origin, sex, marital status, age, receipt of public assistance) is an input, and none is derivable from the inputs listed.

| Input                                    | Source                                                                                         | Used for                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| `creditScore` (FICO)                     | manual entry                                                                                   | credit component                  |
| `otdLtv` (out-the-door loan-to-value, %) | computed by `calculator.ts` from price, tax, fees, down/trade/rebate, book value               | LTV component                     |
| `monthlyPayment`, `monthlyIncome`        | computed / manual entry                                                                        | payment-to-income (PTI) component |
| `fitCount`                               | `lenderFit.ts` — count of active lender programs whose published rules the structure satisfies | eligibility cap and band          |

Missing inputs are held **neutral**, never punished or rewarded: unknown FICO or LTV scores the component at 50; unknown income scores PTI at 50 (it cannot earn the best affordability component).

## 4. Model description (as implemented)

Each component is mapped to 0–100, then combined with fixed weights, then capped, then clamped.

```
creditComp = clamp((FICO − 450) / 4, 0, 100)                       // 450→0, 850→100
ltvComp    = clamp(115 − (otdLtv − 100) × 2.2, 0, 105)              // ≤~95% → 105 (cap); ~147.7% → 0
ptiComp    = clamp(100 − max(0, PTI − 12) × 5, 0, 100)              // ≤12% → 100; 32% → 0

score = 0.36·creditComp + 0.50·ltvComp + 0.14·ptiComp

Affordability caps:   PTI ≥ 20% → score ≤ 55 ;  PTI ≥ 25% → score ≤ 35
Eligibility cap:      fitCount = 0 → score ≤ 45 and band = "none"
Final:                round(clamp(score, 8, 98))

Bands: strong ≥ 72 · moderate ≥ 50 · weak < 50 · none (fits no active lender)
```

The score also returns up to a handful of **principal drag factors** in plain language ("OTD LTV high (131%)", "Payment-to-income high (21.4%)", "Credit score in subprime range", "No active lender fits this structure", "Monthly income missing; PTI held neutral"). These are diagnostic hints for the desk, not adverse-action reasons.

## 5. Outputs and how they are shown

- **Gauge / numeric score** — internal desk only; always accompanied by the caption _"Estimate, not a credit decision or offer of credit. Final terms require a lender credit check."_
- **Band label** — strong / moderate / weak / none.
- **Fit count** — "N of M lenders fit," derived from the published-rules engine (`lenderMatcher.ts`), which is the single source of truth for eligibility. The score is capped so it can never read better than the rules engine allows.

## 6. Guardrails (in code)

1. **Eligibility floor** — a structure that fits no active lender program cannot read above 45 or show any band but "none." The heuristic cannot contradict the rules engine.
2. **Affordability veto** — PTI at or above 20% / 25% caps the score regardless of credit and LTV.
3. **Neutral unknowns** — missing data never inflates the score.
4. **Role gating (server-side)** — `sales` users see band and fit count but never lender buy-rate or dealer reserve (`backend/pb_hooks/field_visibility.pb.js`).
5. **Disclaimer on every surface** — the estimate caption is rendered with the score, and printed deal paper is marked internal-use.
6. **Single tunable config** — every constant lives in `APPROVAL_CONFIG`; changes are code-reviewed and versioned with this card.

## 7. Fairness and protected classes

- **No protected-class inputs; no proxies by design.** Inputs are FICO, loan-to-value, payment-to-income, and rules-engine fit. Geography, name, language, and any demographic field are not read.
- **Residual proxy risk.** FICO, LTV, and PTI are themselves correlated with protected classes in the population. Because the score is advisory, internal, and never a decision, this risk is bounded — but it is the reason the score must **never** be used to steer, price, or discourage a consumer. That policy is stated in the Terms of Service and should be reinforced in dealer onboarding.
- **No disparate-treatment vector.** The same inputs produce the same score for every customer; there is no manual override or per-customer adjustment.

## 8. Known limitations (read before trusting the number)

1. **Not calibrated.** A "72" is not a 72% probability of approval. The score has not been fit or validated against real lender decisions. Treat bands as ordinal (better/worse), not as probabilities.
2. **Labeled weights ≠ effective influence.** Although the config labels credit at 0.36 and LTV at 0.50, the components sit on different scales: one FICO point moves the score ≈0.09, one percentage point of LTV moves it ≈1.1, and the LTV component can reach 105. Across realistic ranges LTV can swing the score ~52 points, FICO ~36, PTI ~14. **The heuristic is LTV-dominant.** This mirrors the desk's structuring lever (advance), but a reviewer must not read the labels as relative importance to lenders, which tier on FICO first.
3. **Top-end compression.** The 98 ceiling means very strong and merely good prime files can converge; ranking power is weakest at the top.
4. **Manual FICO.** The score inherits any error in the typed score and knows nothing of tradelines, DTI, or bureau attributes.
5. **Book-value dependence.** LTV is only as good as the book value on file (J.D. Power / NADA / KBB / Black Book / MMR as imported).
6. **Michigan-anchored tax engine.** OTD (and therefore LTV) is exact for MI and modeled for OH/IN/IL/FL with MI reciprocity; other states are not supported yet, which affects the score's inputs, not its logic.

## 9. Validation and monitoring plan

- **Before relying on it for ranking in production sales:** collect (score, band, lender decision) pairs from the pipeline's status field and compute approval rate by band. A monotonic relationship (strong > moderate > weak) is the minimum bar; recalibrate `APPROVAL_CONFIG` if it does not hold.
- **Input/output logging:** every scored deal that is saved records its inputs and score in `saved_deals` / `deal_events`, which is the audit trail for the analysis above.
- **Change control:** any change to `APPROVAL_CONFIG`, the component curves, caps, or bands requires updating §4 and §8 of this card in the same pull request.

## 10. Required user-facing language

Every surface that renders the score, band, or a payment/APR derived from it must carry, verbatim or equivalent:

> _Estimate based on entered data — not a credit decision or offer of credit. Final terms require a lender credit check._

Printed deal worksheets are internal-use unless they carry the full Truth-in-Lending companion disclosures.

---

_Questions about this card: the support contact configured in `VITE_SUPPORT_EMAIL`. Counsel review of this card is recommended before the product is sold outside a pilot._
