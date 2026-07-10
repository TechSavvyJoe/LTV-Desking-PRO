import React, { useEffect, useState } from "react";
import { getSystemSettings, getCachedSystemSettings } from "../../lib/api";
import * as Icons from "./Icons";

export const AnnouncementBanner: React.FC = () => {
  const [text, setText] = useState<string>(() => {
    return getCachedSystemSettings()?.announcementBanner || "";
  });

  useEffect(() => {
    let cancelled = false;
    getSystemSettings()
      .then((s) => {
        if (!cancelled) setText(s.announcementBanner || "");
      })
      .catch(() => {
        // Silent — cached value (if any) remains
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!text.trim()) return null;

  return (
    <div
      className="bg-[var(--color-warning)] text-white dark:text-[var(--color-bg)] px-4 py-2 text-sm flex items-center gap-2 justify-center"
      role="status"
      aria-live="polite"
    >
      <Icons.ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span className="font-medium">{text}</span>
    </div>
  );
};

export default AnnouncementBanner;
