import React from "react";

/**
 * Skip Navigation Link - Essential accessibility feature
 * Allows keyboard users to skip past navigation to main content
 * Only visible when focused
 */
const SkipNavLink: React.FC<{ href?: string }> = ({
  href = "#main-content",
}) => {
  return (
    <a
      href={href}
      className="
        sr-only focus:not-sr-only
        fixed top-4 left-4 z-[9999]
        px-4 py-2
        bg-blue-600 text-white
        font-semibold text-sm
        rounded-lg shadow-lg
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        transform -translate-y-full focus:translate-y-0
        transition-transform duration-200
      "
    >
      Skip to main content
    </a>
  );
};

export default SkipNavLink;
