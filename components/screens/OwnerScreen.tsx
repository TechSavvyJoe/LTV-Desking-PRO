import React from "react";
import { Navigate } from "react-router-dom";

/**
 * Owner Console screen — wave 2 restyles the SuperAdminDashboard panels into
 * this slot (plan Phase 7). Until then the console lives at /admin. [dc-redesign]
 */
export const OwnerScreen: React.FC = () => {
  return <Navigate to="/admin" replace />;
};

export default OwnerScreen;
