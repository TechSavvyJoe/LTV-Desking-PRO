import React from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../common/states";
import * as Icons from "../common/Icons";

/**
 * Owner Console screen — wave 2 restyles the SuperAdminDashboard panels into
 * this slot (plan Phase 7). Until then the console lives at /admin. [dc-redesign]
 * Shows a friendly empty/placeholder state with action to enter.
 */
export const OwnerScreen: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div data-screen-label="Owner">
      <EmptyState
        icon={<Icons.ComputerDesktopIcon className="w-full h-full" />}
        title="Owner Console"
        description="Central admin and multi-dealer oversight. The full console is available at the admin route."
        primaryAction={{
          label: "Open Owner Console",
          onClick: () => navigate("/admin", { replace: true }),
        }}
        secondaryAction={{
          label: "Back to desk",
          onClick: () => navigate("/desk"),
          variant: "secondary",
        }}
      />
    </div>
  );
};

export default OwnerScreen;
