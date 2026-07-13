import React from "react";
import { SUPPORT_EMAIL } from "../../constants";
import LegalLayout from "./LegalLayout";

/**
 * Stub Terms of Service. **Not legal advice. Not a final document.**
 *
 * Truth-passed 2026-06-11: false claims removed (Stripe billing that doesn't
 * exist, a 99.9% uptime target we can't honor, an always-today "Last updated"
 * stamp). Counsel review is still required before the first paid invoice.
 */
const TermsOfService: React.FC = () => {
  return (
    <LegalLayout
      title="Terms of Service"
      description="The operating terms for dealership access to LTV Desking PRO and its calculation and AI-assisted tools."
      updated="June 11, 2026"
    >
      <section>
        <h2>1. Service</h2>
        <p>
          LTV Desking PRO ("we", "us") provides automotive desking, lender-matching, and F&amp;I
          tooling to US automotive dealerships ("you", "Customer").
        </p>
      </section>

      <section>
        <h2>2. Account responsibility</h2>
        <p>
          You are responsible for keeping your account credentials secure. Notify us immediately of
          unauthorized access. Accounts may not be shared.
        </p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the service to violate any law, including consumer-finance regulations.</li>
          <li>
            Upload content you do not have the right to use, including protected lender materials or
            customer information you have not collected lawfully.
          </li>
          <li>Reverse-engineer the platform or attempt to access another tenant&apos;s data.</li>
          <li>Resell the service without a written reseller agreement.</li>
        </ul>
      </section>

      <section>
        <h2>4. AI features and calculations</h2>
        <p>
          AI-assisted features can produce inaccurate output. Payments, rates, taxes, and lender-fit
          indications are <strong>estimates and preliminary screens only</strong>. They are not
          offers or extensions of credit and are not Truth-in-Lending disclosures. You are
          responsible for verifying every figure and lender program before presenting a deal to a
          customer.
        </p>
      </section>

      <section>
        <h2>5. Billing</h2>
        <p>
          During the pilot program, fees and billing terms are set in your written Pilot Agreement
          and invoiced directly. Cancellation and the end of access follow that agreement.
        </p>
      </section>

      <section>
        <h2>6. Service availability</h2>
        <p>
          We provide the service on a commercially reasonable efforts basis and make no uptime
          guarantee. We are not liable for consequential damages from downtime.
        </p>
      </section>

      <section>
        <h2>7. Compliance disclaimer</h2>
        <p>
          Truth in Lending Act (TILA / Regulation Z), Military Lending Act, state APR caps, and
          other consumer-finance obligations remain the dealership&apos;s responsibility. The
          service provides tools and does not assume your compliance obligations.
        </p>
      </section>

      <section>
        <h2>8. Termination</h2>
        <p>
          We may suspend or terminate accounts that violate these terms. We will provide reasonable
          notice and an opportunity to export data before deletion when circumstances permit.
        </p>
      </section>

      <section>
        <h2>9. Governing law</h2>
        <p>These terms are governed by the laws of the State of New York.</p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>
          We may update these terms. We will notify the customer of record by email at least 30 days
          before material changes take effect.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Legal questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </section>
    </LegalLayout>
  );
};

export default TermsOfService;
