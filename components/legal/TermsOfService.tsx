import React from "react";

/**
 * Stub Terms of Service. **Not legal advice. Not a final document.**
 *
 * Replace with a real ToS before charging customers. Until then, this
 * stub fulfils the launch-checklist gate of "there is a /terms URL that
 * doesn't 404."
 */
const TermsOfService: React.FC = () => {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-3xl mx-auto px-6 py-12 prose prose-slate dark:prose-invert focus:outline-none"
    >
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-500">Last updated: {new Date().toLocaleDateString()}</p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        ⚠️ This is a placeholder pending lawyer review. Not legal advice.
      </p>

      <h2>1. Service</h2>
      <p>
        LTV Desking PRO ("we", "us") provides automotive desking, lender-matching, and F&amp;I
        tooling to US automotive dealerships ("you", "Customer").
      </p>

      <h2>2. Account responsibility</h2>
      <p>
        You are responsible for keeping your account credentials secure. Notify us immediately of
        any unauthorized access. You may not share accounts.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service to violate any law, including consumer-finance regulations.</li>
        <li>
          Upload content you don&apos;t have the right to (e.g., rate sheets covered by NDA with a
          lender, customer PII you haven&apos;t collected lawfully).
        </li>
        <li>Reverse-engineer the platform or attempt to access other tenants&apos; data.</li>
        <li>Resell the service without a written reseller agreement.</li>
      </ul>

      <h2>4. AI features</h2>
      <p>
        AI-assisted features (rate-sheet extraction, deal analysis) are provided as-is. You are
        responsible for verifying AI output before relying on it for any deal you present to a
        customer.
      </p>

      <h2>5. Billing</h2>
      <p>
        Subscription terms are presented at signup. We bill via Stripe. Refunds at our discretion.
        You can cancel at any time; access continues through the end of the billing period.
      </p>

      <h2>6. Service availability</h2>
      <p>
        We target 99.9% monthly uptime but make no guarantees. We are not liable for consequential
        damages from downtime.
      </p>

      <h2>7. Compliance disclaimer</h2>
      <p>
        Truth in Lending Act (TILA / Reg Z), Military Lending Act, state APR caps, and other
        consumer-finance regulations are your responsibility as the dealership. We provide tooling
        but do not assume compliance liability.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these terms. We will provide reasonable
        notice and the opportunity to export your data before deletion.
      </p>

      <h2>9. Governing law</h2>
      <p>These terms are governed by the laws of the State of New York.</p>

      <h2>10. Changes</h2>
      <p>
        We may update these terms. We will email Customer-of-record notice at least 30 days before
        material changes take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Legal: <a href="mailto:legal@ltvdeskingpro.com">legal@ltvdeskingpro.com</a>
      </p>
    </main>
  );
};

export default TermsOfService;
