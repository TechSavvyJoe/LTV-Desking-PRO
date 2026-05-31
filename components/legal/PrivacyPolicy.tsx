import React from "react";

/**
 * Stub Privacy Policy. **Not legal advice. Not a final document.**
 *
 * Replace with a real policy before charging customers — Termly, Iubenda,
 * or a privacy lawyer review will all produce something specific to the
 * data we actually collect and the jurisdictions we operate in. Until
 * then, this stub fulfils the launch-checklist gate of "there is a
 * privacy URL that doesn't 404."
 */
const PrivacyPolicy: React.FC = () => {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-3xl mx-auto px-6 py-12 prose prose-slate dark:prose-invert focus:outline-none"
    >
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-500">Last updated: {new Date().toLocaleDateString()}</p>
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
          and any documents you upload (e.g., rate sheets for AI extraction).
        </li>
        <li>
          <strong>Operational telemetry.</strong> Error reports via Sentry, request logs, audit
          trail of administrative actions.
        </li>
        <li>
          <strong>We do not collect</strong> end-customer SSNs, driver's-license numbers, or
          credit-report data unless and until a credit-pull integration is enabled (none currently).
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>Run the dealer-desking workflows you ask us to run.</li>
        <li>Diagnose errors and improve reliability (Sentry, audit log).</li>
        <li>
          AI features (lender rate-sheet extraction, deal-analysis suggestions) — your data is sent
          to the AI provider you select in the Owner Console (OpenAI, Anthropic, or Google Gemini)
          and is governed by that provider's data policies. We do not train our own models on your
          data.
        </li>
      </ul>

      <h2>How we store it</h2>
      <ul>
        <li>Primary database: PocketBase on Fly.io (US region, single tenant).</li>
        <li>Continuous backups to Cloudflare R2 (US region).</li>
        <li>
          AI provider keys: stored in your dealer&apos;s PocketBase instance, never in environment
          variables, never visible to the frontend.
        </li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>Export your data on request. Email support to start a request.</li>
        <li>
          Delete your account and associated dealer data. Hard-delete completes within 30 days;
          backups roll out of retention within 14 days.
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
        Questions: <a href="mailto:support@ltvdeskingpro.com">support@ltvdeskingpro.com</a>
      </p>
    </main>
  );
};

export default PrivacyPolicy;
