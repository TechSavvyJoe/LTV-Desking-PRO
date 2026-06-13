# Pilot Charter — LTV Desking PRO

**Status:** draft for the owner to complete with the pilot dealer · **Term:** 30 days, renewable once.

## What we are testing

LTV Desking PRO as a **companion to the dealership's DMS**: AI-extracted lender programs +
whole-inventory LTV/payment matching at the desk. It does not replace the DMS, menus, e-sign, or
contracting. Geography: Michigan dealerships (the tax engine models MI dealers).

## Success metrics (measured via in-app analytics + the Friday loop)

| #   | Metric                                                     | Target by day 30             |
| --- | ---------------------------------------------------------- | ---------------------------- |
| 1   | Adoption — distinct desk users firing `deal_desked` weekly | ≥ 3 by week 2                |
| 2   | Volume — real deals desked per week (`deal_desked`)        | ≥ 10/week                    |
| 3   | Output — customer sheets generated (`pdf_generated`)       | ≥ 5/week                     |
| 4   | Trust — quote-vs-funded payment delta on sampled deals     | ≤ $10/mo on ≥ 80% of samples |
| 5   | Data freshness — inventory imports (`import_completed`)    | ≥ 1/week                     |

**Kill criteria:** desk stops using it for a full week (metric 1 = 0) twice, or metric 4 misses two
weeks running. **Convert criteria:** metrics hit + the dealer agrees to a paid reference-customer
rate.

## The Friday quote-vs-funded loop (30 min/week, no code)

Pull 5 funded deals from the DMS/funding packets. For each, find the matching saved deal in the
app (Saved Deals tab, or the CSV export) and log in a shared sheet:
`deal # · tool payment · contract payment · delta · tool top lender fit · funding lender · notes`.
This is the single most convincing accuracy metric the product can earn.

## Feedback loop

- "Report a problem" button in the app footer (pre-filled email) for anything mid-deal.
- Weekly 20-minute call with the desk manager: what did you reach for that wasn't there?
- Owner reviews PostHog weekly against the table above.

## Rollback promise

If the pilot ends (either direction): saved deals export to CSV in-app same-day; full data export
per `docs/runbooks/dealer-offboarding.md` within 14 days; records deleted on request and backups
age out within 14 days thereafter.

## The arms-length rule

The founder's own store is the dogfood/staging environment. The evidence pilot is the OTHER
store — its onboarding friction, its desk's trust, its numbers. Don't blend the two datasets.
