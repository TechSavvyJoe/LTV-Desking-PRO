import React from "react";
import { SUPPORT_EMAIL } from "../../constants";

/**
 * Stub Terms of Service. **Not legal advice. Not a final document.**
 *
 * Truth-passed 2026-06-11: false claims removed (Stripe billing that doesn't
 * exist, a 99.9% uptime target we can't honor, an always-today "Last updated"
 * stamp). Counsel review is still required before the first paid invoice.
 */
const TermsOfService: React.FC = () => {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-3xl mx-auto px-6 py-12 prose prose-slate dark:prose-invert focus:outline-none"
    >
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-500">Last updated: June 11, 2026</p>
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

      <h2>4. AI features and calculations</h2>
      <p>
        AI-assisted features (rate-sheet extraction, deal analysis) are provided as-is and may
        produce inaccurate output. All payments, rates, taxes, and lender-fit indications shown by
        the service are <strong>estimates and preliminary screens only</strong> — they are not
        offers or extensions of credit and are not Truth-in-Lending disclosures. You are responsible
        for verifying every figure and every lender program before relying on it for any deal you
        present to a customer.
      </p>

      <h2>5. Billing</h2>
      <p>
        During the pilot program, fees and billing terms are set in your written Pilot Agreement and
        invoiced directly. You can cancel per that agreement; access continues through the end of
        the paid period.
      </p>

      <h2>6. Service availability</h2>
      <p>
        We provide the service on a commercially reasonable efforts basis and make no uptime
        guarantee. We are not liable for consequential damages from downtime.
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
        Legal: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </main>
  );
};

export default TermsOfService;
