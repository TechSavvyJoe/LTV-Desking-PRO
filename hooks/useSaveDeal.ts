import { useCallback } from "react";
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
import { queryClient, queryKeys } from "../lib/queryClient";
import type { CalculatedVehicle, SavedDeal } from "../types";
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

  const saveMutation = useMutation({
    mutationFn: (payload: NewSavedDealPayload) => saveDeal(payload),
  });

  const handleSaveDeal = useCallback(
    (vehicleOverride?: CalculatedVehicle) => {
      const vehicleToSave = vehicleOverride || activeVehicle;
      if (!vehicleToSave) {
        setMessage({ type: "error", text: "Pick a vehicle on the desk before saving." });
        return;
      }
      if (
        typeof vehicleToSave.price !== "number" ||
        vehicleToSave.price <= 0 ||
        typeof vehicleToSave.mileage !== "number" ||
        vehicleToSave.mileage < 0 ||
        !vehicleToSave.vin ||
        vehicleToSave.vin.length < 11
      ) {
        setMessage({
          type: "error",
          text: "Add the vehicle's price, mileage and VIN before saving.",
        });
        return;
      }
      if (!customerName) {
        setErrors((prev) => ({
          ...prev,
          customerName: "Enter the customer's name",
        }));
        setMessage({ type: "error", text: "Enter the customer's name to save the deal." });
        return;
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
        name: `${now.split("T")[0]} - ${customerName}`,
        customerName,
        salespersonName,
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

      saveMutation.mutate(newDealData, {
        onSuccess: (saved) => {
          if (!saved) {
            setMessage({
              type: "error",
              text: "Couldn't save the deal. Check your connection and try again.",
            });
            return;
          }
          const mappedSaved: SavedDeal = mapPocketBaseSavedDeal(saved);
          setSavedDeals((prev) => [mappedSaved, ...prev]);
          void queryClient.invalidateQueries({ queryKey: queryKeys.savedDeals });
          setMessage({ type: "success", text: "Deal saved" });
          setIsDealDirty(false);
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
        },
        onError: () => {
          setMessage({
            type: "error",
            text: "Couldn't save the deal. Check your connection and try again.",
          });
        },
      });
    },
    [
      activeVehicle,
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
    ]
  );

  return { handleSaveDeal };
}

export default useSaveDeal;
