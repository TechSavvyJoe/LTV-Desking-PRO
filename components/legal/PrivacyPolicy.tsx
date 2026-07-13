import React from "react";
import { SUPPORT_EMAIL } from "../../constants";
import LegalLayout from "./LegalLayout";

/**
 * Stub Privacy Policy. **Not legal advice. Not a final document.**
 *
 * Truth-passed 2026-06-11 so every statement matches what the product
 * actually does (multi-tenant storage, owner-managed AI keys, end-customer
 * name/income/credit-estimate storage in saved deals, manual export/deletion
 * on request). Counsel review still required before the first paid invoice.
 */
const PrivacyPolicy: React.FC = () => {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="How LTV Desking PRO handles dealership, employee, vehicle, lender, and deal information."
      updated="June 11, 2026"
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info.</strong> Email address, first and last name, phone (optional), and
            the dealer code or dealership you belong to.
          </li>
          <li>
            <strong>Deal and inventory data.</strong> Vehicle records, lender profiles, saved deals,
            and documents you upload for AI extraction. Saved deals can include an
            end-customer&apos;s{" "}
            <strong>name, dealer-estimated credit score, and stated monthly income</strong>. Treat
            these as consumer financial information under your dealership&apos;s safeguards program.
          </li>
          <li>
            <strong>Operational telemetry.</strong> Error reports through Sentry, request logs, and
            the audit trail of administrative actions.
          </li>
          <li>
            <strong>Data we do not collect.</strong> The product does not collect end-customer SSNs
            or driver&apos;s-license numbers and does not pull credit reports. Pay-stub images
            scanned for income are processed in your browser and are not uploaded to our servers.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>Run the dealership workflows you ask us to run.</li>
          <li>Diagnose errors, maintain auditability, and improve reliability.</li>
          <li>
            For AI features, uploaded rate sheets and deal figures may be sent to the provider
            configured by the platform owner. This can include the dealer-estimated credit score and
            stated income, but not the customer&apos;s name. Provider data policies apply. We
            disable provider-side retention where supported and do not train our own models on your
            data.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we store it</h2>
        <ul>
          <li>
            The primary PocketBase database runs on Fly.io in a US region. Server-enforced access
            rules isolate each dealership&apos;s records.
          </li>
          <li>Continuous database backups are stored in Cloudflare R2.</li>
          <li>
            AI provider keys are managed by the platform owner, stored server-side, and are not
            returned to dealership users or the browser application.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your rights</h2>
        <ul>
          <li>
            Request an export through support. We process written export requests manually within 30
            days; saved deals can also be exported to CSV in the product.
          </li>
          <li>
            Request deletion of your account and associated dealership data in writing. We process
            deletion manually within 30 days, and backups roll out of the retention window within 14
            days thereafter.
          </li>
          <li>Request the current list of subprocessors.</li>
        </ul>
      </section>

      <section>
        <h2>Subprocessors</h2>
        <ul>
          <li>Fly.io for application infrastructure</li>
          <li>Vercel for frontend hosting and the AI proxy</li>
          <li>Cloudflare R2 for encrypted backup storage</li>
          <li>Sentry for error tracking</li>
          <li>OpenAI, Anthropic, or Google for the AI provider selected by the platform owner</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Privacy questions and requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </section>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
