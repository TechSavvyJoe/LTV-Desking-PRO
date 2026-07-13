import React from "react";
import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "../../constants";
import { BrandWordmark } from "../common/BrandMark";
import { ChevronLeftIcon } from "../common/Icons";

interface LegalLayoutProps {
  title: string;
  description: string;
  updated: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({ title, description, updated, children }) => (
  <div className="legal-page">
    <header className="legal-topbar">
      <BrandWordmark size="sm" />
      <Link to="/desk" className="legal-back-link">
        <ChevronLeftIcon className="w-4 h-4" />
        Return to the desk
      </Link>
    </header>

    <main id="main-content" tabIndex={-1} className="legal-main">
      <div className="legal-heading">
        <p className="legal-eyebrow">Legal &amp; compliance</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="legal-layout">
        <aside className="legal-meta" aria-label="Document information">
          <dl>
            <div>
              <dt>Status</dt>
              <dd>Draft for counsel review</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{updated}</dd>
            </div>
            <div>
              <dt>Applies to</dt>
              <dd>US dealership accounts</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </dd>
            </div>
          </dl>
          <p className="legal-review-note">
            Product behavior has been checked against this draft. External counsel approval is still
            required before commercial launch.
          </p>
        </aside>

        <article className="legal-document">{children}</article>
      </div>
    </main>
  </div>
);

export default LegalLayout;
