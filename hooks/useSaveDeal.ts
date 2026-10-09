import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDealContext } from "../context/DealContext";
import { saveDeal, logDealEvent } from "../lib/api";
import { capture } from "../lib/analytics";
import { calculateFinancials } from "../services/calculator";
import { lenderFitForVehicle } from "../services/lenderFit";
import { scoreApprovalOdds } from "../services/approvalScorer";
import { assessDeal, holdIncompleteFits } from "../services/dealAssessment";
import { normalizeBackendProductFields } from "../services/backendProducts";
import { mapPocketBaseSavedDeal } from "../lib/dealMappers";
import { currentDealerQueryKeys, queryClient, queryKeys } from "../lib/queryClient";
import { getPrivateSessionEpoch } from "../lib/privateSession";
import type { CalculatedVehicle, LenderProfile, SavedDeal, Vehicle } from "../types";
import type { SavedDeal as PocketBaseSavedDeal } from "../lib/pocketbase";

type NewSavedDealPayload = Omit<
  PocketBaseSavedDeal,
  "id" | "dealer" | "user" | "created" | "updated"
>;

/**
 * Save-to-pipeline handler, extracted verbatim from the legacy MainLayout
 * (App.tsx) so DeskScreen's save flow can consume it. Validation, the lender
 * eligibility snapshot [G48], deal_saved event and analytics capture are all
 * preserved. Persist path uses React Query useMutation. [dc-redesign]
 */
export function useSaveDeal() {
  const {
    settings,
    inventory,
    dealData,
    filters,
    customerName,
    salespersonName,
    activeVehicle,
    scratchPadNotes,
    safeLenderProfiles,
    setSavedDeals,
    setMessage,
    setErrors,
    setIsDealDirty,
  } = useDealContext();

  // A ref closes the same-event-loop double-click window before React paints
  // the disabled button. The request is released on both success and failure.
  const saving = useRef(false);
  const mounted = useRef(true);
  const sessionEpoch = useRef(getPrivateSessionEpoch()).current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrentSession = useCallback(
    () => mounted.current && sessionEpoch === getPrivateSessionEpoch(),
    [sessionEpoch]
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  // activeVehicle is the restored/focused snapshot. Inventory can update the
  // same VIN without replacing that snapshot; quote from its current source.
  const sourceVehicle = inventory.find((v) => v.vin === activeVehicle?.vin) ?? activeVehicle;
  const signature = JSON.stringify([
    customerName,
    salespersonName,
    dealData,
    filters,
    scratchPadNotes,
    sourceVehicle && {
      id: sourceVehicle.id,
      vin: sourceVehicle.vin,
      stock: sourceVehicle.stock,
      vehicle: sourceVehicle.vehicle,
      price: sourceVehicle.price,
      jdPower: sourceVehicle.jdPower,
      jdPowerRetail: sourceVehicle.jdPowerRetail,
      unitCost: sourceVehicle.unitCost,
      condition: sourceVehicle.condition,
      modelYear: sourceVehicle.modelYear,
      mileage: sourceVehicle.mileage,
    },
    settings,
    safeLenderProfiles,
  ]);
  const currentSignature = useRef(signature);
  useEffect(() => {
    currentSignature.current = signature;
  }, [signature]);

  const saveMutation = useMutation({
    mutationFn: (payload: NewSavedDealPayload) => saveDeal(payload),
  });

  const handleSaveDeal = useCallback(
    async (vehicleOverride?: CalculatedVehicle): Promise<boolean> => {
      if (saving.current || !isCurrentSession()) return false;
      setSaveError(null);
      const fail = (text: string) => {
        if (!isCurrentSession()) return false;
        setSaveError(text);
        setMessage({ type: "error", text });
        return false;
      };
      const selected = vehicleOverride || activeVehicle;
      const scopedKeys = currentDealerQueryKeys();
      const latestInventory =
        queryClient.getQueryData<Vehicle[]>(scopedKeys.inventory) ?? inventory;
      const vehicleToSave = latestInventory.find((v) => v.vin === selected?.vin) ?? selected;
      if (!vehicleToSave) {
        return fail("Pick a vehicle on the desk before saving.");
      }
      if (
        typeof vehicleToSave.price !== "number" ||
        vehicleToSave.price <= 0 ||
        typeof vehicleToSave.mileage !== "number" ||
        vehicleToSave.mileage < 0 ||
        !vehicleToSave.vin ||
        vehicleToSave.vin.length < 11
      ) {
        return fail("Add the vehicle's price, mileage and VIN before saving.");
      }
      const trimmedName = customerName.trim();
      if (!trimmedName) {
        setErrors((prev) => ({
          ...prev,
          customerName: "Enter the customer's name",
        }));
        return fail("Enter the customer's name to save the deal.");
      }

      const now = new Date().toISOString();

      // Recompute financials synchronously from the LIVE deal inputs — the
      // vehicle handed in comes from the 300ms-debounced scoring pass, so a
      // save clicked right after a term/down change would otherwise persist a
      // payment that never coexisted with the saved dealData. [review/P1]
      const normalizedDealData = {
        ...dealData,
        ...normalizeBackendProductFields(dealData),
      };
      const freshVehicle = calculateFinancials(vehicleToSave, normalizedDealData, settings);
      const freshFit = holdIncompleteFits(
        lenderFitForVehicle(
          freshVehicle,
          { ...normalizedDealData, ...filters },
          safeLenderProfiles
        ),
        filters
      );
      const freshApproval = scoreApprovalOdds(
        freshVehicle,
        filters,
        freshFit.fitCount,
        freshFit.pendingCount,
        freshFit.pendingReason
      );
      const vehicleSnapshot: CalculatedVehicle = {
        ...freshVehicle,
        approvalScore: freshApproval.internalScore,
        approvalBand: freshApproval.band,
        ptiRatio: freshApproval.ptiRatio,
        fitCount: freshFit.fitCount,
        pendingCount: freshFit.pendingCount,
        pendingCause: freshFit.pendingCause ?? undefined,
        fitNames: freshFit.fitNames,
        assessment: assessDeal(
          freshVehicle,
          normalizedDealData,
          filters,
          safeLenderProfiles,
          freshFit
        ),
      };
      vehicleSnapshot.readinessScore = vehicleSnapshot.assessment?.readiness;

      // Lender grid + settings snapshot make the saved deal self-contained
      // evidence of what was on screen at save time. [G48]
      const eligibilitySnapshot = safeLenderProfiles.map((profile) => {
        const result = freshFit.entries.find((entry) => entry.lenderId === profile.id);
        return {
          name: profile.name,
          eligible: result?.eligible ?? false,
          status: result?.status ?? "pending",
          reasons: result?.reasons ?? ["Program was not evaluated."],
          matchedTier: result?.matchedTier?.name ?? null,
          uncheckedConstraints: result?.uncheckedConstraints ?? [],
        };
      });

      const newDealData: NewSavedDealPayload = {
        name: `${now.split("T")[0]} - ${trimmedName}`,
        customerName: trimmedName,
        salespersonName: salespersonName.trim(),
        vehicle: vehicleToSave.id, // Assuming calculated vehicle has ID matching inventory
        vehicleData: { ...vehicleSnapshot } as Record<string, unknown>, // Serialized to JSON in PocketBase
        dealData: { ...normalizedDealData } as Record<string, unknown>,
        customerFilters: {
          creditScore: filters.creditScore,
          monthlyIncome: filters.monthlyIncome,
          monthlyDebt: filters.monthlyDebt,
          maxPayment: filters.maxPayment,
        } as unknown as NewSavedDealPayload["customerFilters"],
        notes: scratchPadNotes,
        // Desk saves land as "pending" (mockup's save-to-pipeline semantics) —
        // "draft" is reserved for deals persisted before they're worked.
        status: "pending" as const,
        // Ranked, verified fitting lender at save time - never a pending sample.
        lenderName: freshFit.fitNames[0],
        calculatedData: {
          lenderEligibility: eligibilitySnapshot,
          settings: { ...settings, ai: undefined },
          savedAt: now,
          // Frozen at-save metrics the Pipeline/Reports mappers read
          // (pipelineMetricsFromCalculatedData) — without them every
          // historical deal was recomputed against CURRENT settings and
          // misreported the quote actually shown. [review/P1]
          monthlyPayment: vehicleSnapshot.monthlyPayment,
          otdLtv: vehicleSnapshot.otdLtv,
          amountToFinance: vehicleSnapshot.amountToFinance,
          approvalScore: vehicleSnapshot.approvalScore,
          assessment: vehicleSnapshot.assessment,
          readinessScore: vehicleSnapshot.readinessScore,
        } as Record<string, unknown>,
      };

      saving.current = true;
      const savedSignature = signature;
      // React Query notifies observers on a scheduled turn. Read its current
      // source at receipt time too, so a synchronous same-VIN cache edit cannot
      // be marked saved before the component has re-rendered.
      const cacheVersion = () =>
        JSON.stringify([
          queryClient
            .getQueryData<Vehicle[]>(scopedKeys.inventory)
            ?.find((v) => v.vin === vehicleToSave.vin),
          queryClient.getQueryData<LenderProfile[]>(scopedKeys.lenderProfiles),
        ]);
      const savedCacheVersion = cacheVersion();
      try {
        const saved = await saveMutation.mutateAsync(newDealData);
        // A write may complete after logout, dealer switch or unmount. No old
        // customer receipt, cache update or audit event belongs to the new identity.
        if (!isCurrentSession()) return false;
        if (!saved) return fail("Couldn't save the deal. Check your connection and try again.");
        const mappedSaved: SavedDeal = mapPocketBaseSavedDeal(saved);
        setSavedDeals((prev) => [mappedSaved, ...prev.filter((deal) => deal.id !== saved.id)]);
        void queryClient.invalidateQueries({ queryKey: queryKeys.savedDeals });
        setMessage({ type: "success", text: "Deal saved" });
        const unchanged =
          currentSignature.current === savedSignature && cacheVersion() === savedCacheVersion;
        // A delayed response must not mark newer customer edits as saved.
        setIsDealDirty(!unchanged);
        void logDealEvent({
          action: "deal_saved",
          customerName,
          vin: vehicleToSave.vin,
          snapshot: {
            dealData: normalizedDealData,
            monthlyPayment: vehicleSnapshot.monthlyPayment,
          },
        });
        capture("deal_saved", { term: dealData.loanTerm });
        if (!unchanged) {
          return fail(
            "The previous version was saved. Newer edits are still unsaved — save again to keep them."
          );
        }
        return true;
      } catch {
        return fail("Couldn't save the deal. Check your connection and try again.");
      } finally {
        saving.current = false;
      }
    },
    [
      activeVehicle,
      inventory,
      customerName,
      salespersonName,
      dealData,
      filters,
      scratchPadNotes,
      settings,
      safeLenderProfiles,
      setSavedDeals,
      setMessage,
      setErrors,
      setIsDealDirty,
      saveMutation,
      signature,
      isCurrentSession,
    ]
  );

  return { handleSaveDeal, isSaving: saveMutation.isPending, saveError };
}

export default useSaveDeal;
