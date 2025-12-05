import PocketBase from "pocketbase";

// PocketBase client singleton
const PB_URL =
  import.meta.env.VITE_POCKETBASE_URL || "https://ltv-desking-pro-api.fly.dev";

export const pb = new PocketBase(PB_URL);

// Enable auto-cancellation of pending requests on new ones
pb.autoCancellation(false);

// Types for our collections
export interface Dealer {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  logo?: string;
  active: boolean;
  settings?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dealer: string;
  role: "sales" | "manager" | "admin" | "superadmin";
  avatar?: string;
  created: string;
  updated: string;
  expand?: {
    dealer?: Dealer;
  };
}

export interface InventoryItem {
  id: string;
  dealer: string;
  vin: string;
  stockNumber?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price: number;
  unitCost?: number;
  jdPower?: number;
  jdPowerRetail?: number;
  status: "available" | "pending" | "sold" | "hold";
  images?: string[];
  notes?: string;
  created: string;
  updated: string;
}

export interface LenderProfile {
  id: string;
  dealer: string;
  name: string;
  active: boolean;
  tiers: Array<{
    name: string;
    maxLtv: number;
    minRate: number;
    maxRate: number;
    maxTerm: number;
  }>;
  notes?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  created: string;
  updated: string;
}

export interface SavedDeal {
  id: string;
  dealer: string;
  user: string;
  vehicle?: string;
  name: string;
  customerName?: string;
  salespersonName?: string;
  vehicleData: Record<string, unknown>;
  dealData: Record<string, unknown>;
  calculatedData?: Record<string, unknown>;
  status:
    | "draft"
    | "pending"
    | "submitted"
    | "approved"
    | "funded"
    | "cancelled";
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    user?: User;
    vehicle?: InventoryItem;
  };
}

export interface DealerSettings {
  id: string;
  dealer: string;
  docFee: number;
  cvrFee: number;
  defaultState: string;
  outOfStateTransitFee: number;
  customTaxRate?: number;
  defaultDownPayment?: number;
  defaultLoanTerm?: number;
  defaultInterestRate?: number;
  created: string;
  updated: string;
}

// Helper to get current user
export const getCurrentUser = (): User | null => {
  return pb.authStore.model as User | null;
};

// Helper to get current dealer ID
export const getCurrentDealerId = (): string | null => {
  const user = getCurrentUser();
  return user?.dealer || null;
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return pb.authStore.isValid;
};

// Export collections for easier access
export const collections = {
  dealers: pb.collection("dealers"),
  users: pb.collection("users"),
  inventory: pb.collection("inventory"),
  lenderProfiles: pb.collection("lender_profiles"),
  savedDeals: pb.collection("saved_deals"),
  dealerSettings: pb.collection("dealer_settings"),
};

export default pb;
