import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "../constants";
import { pb, setSuperadminDealerOverride, getSuperadminDealerOverride } from "./pocketbase";
import { dealerQueryKeys, queryClient } from "./queryClient";

const token = "test." + btoa(JSON.stringify({ exp: 4_000_000_000 })) + ".test";
const saveIdentity = (id: string, role: string, dealer = "dealer-a") =>
  pb.authStore.save(token, { id, role, dealer, collectionId: "users", collectionName: "users" });

afterEach(() => {
  pb.authStore.clear();
  queryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("private session boundaries", () => {
  it("purges financial drafts, legacy private caches and role-filtered queries on 401", async () => {
    saveIdentity("manager-a", "manager");
    for (const key of Object.values(STORAGE_KEYS)) localStorage.setItem(key, "private-value");
    sessionStorage.setItem("superadmin_dealer_override", "dealer-b");
    const key = dealerQueryKeys("dealer-a").inventory;
    queryClient.setQueryData(key, [{ unitCost: 12345 }]);

    await pb.afterSend!(new Response("{}", { status: 401 }), {});

    expect(pb.authStore.token).toBe("");
    expect(queryClient.getQueryData(key)).toBeUndefined();
    for (const storageKey of Object.values(STORAGE_KEYS)) {
      expect(localStorage.getItem(storageKey)).toBe(
        storageKey === STORAGE_KEYS.THEME ? "private-value" : null
      );
    }
    expect(sessionStorage.getItem("superadmin_dealer_override")).toBeNull();
    saveIdentity("sales-a", "sales");
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEYS.FILTERS)).toBeNull();
  });

  it.each([
    ["same-user", "sales", "dealer-a"],
    ["next-user", "manager", "dealer-a"],
    ["same-user", "manager", "dealer-b"],
  ])("purges private data on user, role or dealer transition (%s/%s/%s)", (id, role, dealer) => {
    saveIdentity("same-user", "manager");
    localStorage.setItem(STORAGE_KEYS.DEAL_DATA, '{"profitInputs":{"unitCost":12345}}');
    queryClient.setQueryData(dealerQueryKeys("dealer-a").lenderProfiles, [{ buyRate: 6 }]);
    saveIdentity(id, role, dealer);
    expect(localStorage.getItem(STORAGE_KEYS.DEAL_DATA)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("preserves same-identity drafts and cache during token refresh", () => {
    saveIdentity("manager-a", "manager");
    localStorage.setItem(STORAGE_KEYS.FILTERS, '{"monthlyIncome":5000}');
    const key = dealerQueryKeys("dealer-a").inventory;
    queryClient.setQueryData(key, [{ unitCost: 12345 }]);
    saveIdentity("manager-a", "manager");
    expect(localStorage.getItem(STORAGE_KEYS.FILTERS)).toBe('{"monthlyIncome":5000}');
    expect(queryClient.getQueryData(key)).toEqual([{ unitCost: 12345 }]);
  });

  it("does not accept an old in-flight query after a new identity logs in", async () => {
    saveIdentity("manager-a", "manager");
    let resolveQuery!: (value: unknown) => void;
    const key = dealerQueryKeys("dealer-a").inventory;
    const pending = queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () =>
          new Promise((resolve) => {
            resolveQuery = resolve;
          }),
      })
      .catch(() => null);
    saveIdentity("sales-a", "sales");
    resolveQuery([{ unitCost: 12345 }]);
    await pending;
    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it("purges tenant drafts and queries when an owner changes impersonated dealerships", () => {
    saveIdentity("owner", "superadmin", "");
    setSuperadminDealerOverride("dealer-a");
    localStorage.setItem(STORAGE_KEYS.DEAL_DATA, "dealer-a private data");
    queryClient.setQueryData(dealerQueryKeys("dealer-a").inventory, [{ unitCost: 12345 }]);
    setSuperadminDealerOverride("dealer-a");
    expect(localStorage.getItem(STORAGE_KEYS.DEAL_DATA)).toBe("dealer-a private data");
    setSuperadminDealerOverride("dealer-b");
    expect(localStorage.getItem(STORAGE_KEYS.DEAL_DATA)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(getSuperadminDealerOverride()).toBe("dealer-b");
  });

  it("purges a rejected expired token even when isValid is already false", async () => {
    pb.authStore.save("test." + btoa('{"exp":1}') + ".test", {
      id: "manager-a",
      role: "manager",
      dealer: "dealer-a",
      collectionId: "users",
      collectionName: "users",
    });
    localStorage.setItem(STORAGE_KEYS.SCRATCH_PAD, "private customer notes");
    expect(pb.authStore.isValid).toBe(false);
    await pb.afterSend!(new Response("{}", { status: 401 }), {});
    expect(localStorage.getItem(STORAGE_KEYS.SCRATCH_PAD)).toBeNull();
    expect(pb.authStore.token).toBe("");
  });
});
