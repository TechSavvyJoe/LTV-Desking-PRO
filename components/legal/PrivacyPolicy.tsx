import React from "react";
import { SUPPORT_EMAIL } from "../../constants";

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
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-3xl mx-auto px-6 py-12 prose prose-slate dark:prose-invert focus:outline-none"
    >
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-500">Last updated: June 11, 2026</p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        ⚠️ This is a placeholder pending lawyer review. Not legal advice.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info.</strong> Email address, first and last name, phone (optional), and
          the dealer code or dealership you belong to.
        </li>
        <li>
          <strong>Deal and inventory data.</strong> Vehicle records, lender profiles, saved deals,
          and any documents you upload (e.g., rate sheets for AI extraction). Saved deals can
          include an end-customer&apos;s{" "}
          <strong>name, dealer-estimated credit score, and stated monthly income</strong> — treat
          these as consumer financial information under your dealership&apos;s safeguards program.
        </li>
        <li>
          <strong>Operational telemetry.</strong> Error reports via Sentry, request logs, audit
          trail of administrative actions.
        </li>
        <li>
          <strong>We do not collect</strong> end-customer SSNs or driver&apos;s-license numbers, and
          we do not pull credit reports (there is no credit-bureau integration; credit scores in the
          app are estimates entered by dealership staff). Pay-stub images scanned for income are
          processed entirely in your browser and are never uploaded to our servers.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>Run the dealer-desking workflows you ask us to run.</li>
        <li>Diagnose errors and improve reliability (Sentry, audit log).</li>
        <li>
          AI features (lender rate-sheet extraction, deal-analysis suggestions) — uploaded rate
          sheets and deal figures (including the dealer-estimated credit score and stated income,
          but never the customer&apos;s name) are sent to the AI provider configured by the platform
          owner (OpenAI, Anthropic, or Google Gemini) and are governed by that provider&apos;s data
          policies. We disable provider-side data retention where the provider supports it, and we
          do not train our own models on your data.
        </li>
      </ul>

      <h2>How we store it</h2>
      <ul>
        <li>
          Primary database: PocketBase on Fly.io (US region). The platform is multi-tenant: each
          dealership&apos;s data is isolated by server-enforced access rules.
        </li>
        <li>Continuous backups to Cloudflare R2 (US region).</li>
        <li>
          AI provider keys: managed by the platform owner, stored server-side, never visible to the
          frontend or to dealership users.
        </li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          Export your data on written request to support; we fulfil export requests manually within
          30 days. (Saved deals can also be exported to CSV in-app at any time.)
        </li>
        <li>
          Request deletion of your account and associated dealer data in writing; deletion is
          performed manually within 30 days, and backups roll out of retention within 14 days
          thereafter.
        </li>
        <li>Request a list of subprocessors (see Subprocessors section).</li>
      </ul>

      <h2>Subprocessors</h2>
      <p>We use:</p>
      <ul>
        <li>Fly.io (infrastructure)</li>
        <li>Vercel (frontend hosting + AI proxy)</li>
        <li>Cloudflare R2 (backup storage)</li>
        <li>Sentry (error tracking)</li>
        <li>OpenAI / Anthropic / Google (AI features — only the provider you select)</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </main>
  );
};

export default PrivacyPolicy;
