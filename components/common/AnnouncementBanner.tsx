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
    <div className="bg-amber-400 text-amber-950 px-4 py-2 text-xs flex items-center gap-2 justify-center font-medium">
      <Icons.ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
};

export default AnnouncementBanner;
