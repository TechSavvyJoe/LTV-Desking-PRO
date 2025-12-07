import React, { useState, useEffect } from "react";
import type { LenderProfile, LenderTier } from "../types";
import Modal from "./common/Modal";
import Button from "./common/Button";
import Input from "./common/Input";
import Select from "./common/Select";
import InputGroup from "./common/InputGroup";
import * as Icons from "./common/Icons";

interface LenderProfileModalProps {
  profile: LenderProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: LenderProfile) => void;
}

const NEW_PROFILE_TEMPLATE: Omit<LenderProfile, "id" | "name"> = {
  bookValueSource: "Trade",
  minIncome: 0,
  maxPti: 0,
  tiers: [{ name: "Default Tier", minFico: 600, maxLtv: 125, maxTerm: 72 }],
};

// Compact field component for tier cards
const TierField = ({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
      {label}
    </label>
    {children}
  </div>
);

// Range input pair component
const RangeInputPair = ({
  minName,
  maxName,
  minValue,
  maxValue,
  minPlaceholder,
  maxPlaceholder,
  onChange,
}: {
  minName: string;
  maxName: string;
  minValue: number | undefined;
  maxValue: number | undefined;
  minPlaceholder: string;
  maxPlaceholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="flex items-center gap-1">
    <Input
      type="number"
      name={minName}
      value={minValue ?? ""}
      onChange={onChange}
      placeholder={minPlaceholder}
      className="!px-2 text-center text-xs"
    />
    <span className="text-slate-400 text-xs font-bold">–</span>
    <Input
      type="number"
      name={maxName}
      value={maxValue ?? ""}
      onChange={onChange}
      placeholder={maxPlaceholder}
      className="!px-2 text-center text-xs"
    />
  </div>
);

const LenderProfileModal: React.FC<LenderProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const getDefaultFormData = (): LenderProfile => ({
    id: `new_${Date.now()}`,
    name: "",
    bookValueSource: NEW_PROFILE_TEMPLATE.bookValueSource,
    minIncome: NEW_PROFILE_TEMPLATE.minIncome,
    maxPti: NEW_PROFILE_TEMPLATE.maxPti,
    tiers: NEW_PROFILE_TEMPLATE.tiers,
  });

  const [formData, setFormData] = useState<LenderProfile>(getDefaultFormData());
  const [activeTierIndex, setActiveTierIndex] = useState<number | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({ ...profile });
    } else {
      setFormData(getDefaultFormData());
    }
    setActiveTierIndex(null);
  }, [profile, isOpen]);

  const handleGeneralChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number" ? (value === "" ? undefined : Number(value)) : value,
    }));
  };

  const handleTierChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type } = e.target;
    const tiers = [...(formData.tiers || [])];
    if (tiers[index]) {
      (tiers[index] as any)[name] =
        type === "number" ? (value === "" ? undefined : Number(value)) : value;
    }
    setFormData((prev) => ({ ...prev, tiers }));
  };

  const addTier = () => {
    const newTier: LenderTier = {
      name: `Tier ${(formData.tiers?.length || 0) + 1}`,
      minFico: 600,
      maxLtv: 120,
      maxTerm: 72,
    };
    setFormData((prev) => ({
      ...prev,
      tiers: [...(prev.tiers || []), newTier],
    }));
    setActiveTierIndex(formData.tiers?.length || 0);
  };

  const duplicateTier = (index: number) => {
    const tiers = [...(formData.tiers || [])];
    if (tiers[index]) {
      const duplicated = {
        ...tiers[index],
        name: `${tiers[index].name} (Copy)`,
      };
      tiers.splice(index + 1, 0, duplicated);
      setFormData((prev) => ({ ...prev, tiers }));
    }
  };

  const removeTier = (index: number) => {
    if ((formData.tiers?.length || 0) <= 1) return;
    const tiers = [...(formData.tiers || [])];
    tiers.splice(index, 1);
    setFormData((prev) => ({ ...prev, tiers }));
    if (activeTierIndex === index) {
      setActiveTierIndex(null);
    } else if (activeTierIndex !== null && activeTierIndex > index) {
      setActiveTierIndex(activeTierIndex - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={profile ? `Edit ${formData.name || "Lender"}` : "Add New Lender"}
      description="Configure lending guidelines and credit tier structures"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} className="ml-auto">
            <Icons.SaveIcon className="w-4 h-4 mr-2" />
            Save Lender
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings - Premium Card */}
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600">
            <h4 className="flex items-center gap-2 text-sm font-bold text-white">
              <Icons.BuildingLibraryIcon className="w-5 h-5" />
              Lender Settings
            </h4>
            <p className="text-blue-100 text-xs mt-0.5">
              Required fields and global parameters
            </p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="sm:col-span-2 lg:col-span-1">
                <InputGroup label="Lender Name*" htmlFor="name">
                  <Input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleGeneralChange}
                    placeholder="e.g. Ally Financial"
                    required
                  />
                </InputGroup>
              </div>
              <InputGroup label="Book Value Source" htmlFor="bookValueSource">
                <Select
                  id="bookValueSource"
                  name="bookValueSource"
                  value={formData.bookValueSource || "Trade"}
                  onChange={handleGeneralChange}
                >
                  <option value="Trade">JD Power Trade</option>
                  <option value="Retail">JD Power Retail</option>
                </Select>
              </InputGroup>
              <InputGroup label="Min Monthly Income" htmlFor="minIncome">
                <Input
                  type="number"
                  id="minIncome"
                  name="minIncome"
                  value={formData.minIncome || ""}
                  onChange={handleGeneralChange}
                  min="0"
                  placeholder="$0"
                />
              </InputGroup>
              <InputGroup label="Max PTI %" htmlFor="maxPti">
                <Input
                  type="number"
                  id="maxPti"
                  name="maxPti"
                  value={formData.maxPti || ""}
                  onChange={handleGeneralChange}
                  min="0"
                  max="100"
                  placeholder="0%"
                />
              </InputGroup>
            </div>
          </div>
        </div>

        {/* Lending Tiers Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                <Icons.ListIcon className="w-5 h-5 text-indigo-500" />
                Credit Tiers
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Define credit tiers with specific LTV, term, and eligibility
                requirements
              </p>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={addTier}>
              <Icons.PlusIcon className="w-4 h-4 mr-1" />
              Add Tier
            </Button>
          </div>

          {/* Tier Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
            {(formData.tiers || []).map((tier, index) => (
              <div
                key={index}
                className={`group relative bg-white dark:bg-slate-800 rounded-xl border-2 overflow-hidden transition-all duration-200 shadow-sm hover:shadow-lg ${
                  activeTierIndex === index
                    ? "border-blue-500 ring-2 ring-blue-500/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600"
                }`}
              >
                {/* Tier Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 cursor-pointer"
                  onClick={() =>
                    setActiveTierIndex(activeTierIndex === index ? null : index)
                  }
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        index === 0
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                          : index === 1
                          ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white"
                          : index === 2
                          ? "bg-gradient-to-br from-purple-400 to-purple-600 text-white"
                          : "bg-gradient-to-br from-slate-400 to-slate-600 text-white"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => handleTierChange(index, e as any)}
                        name="name"
                        className="w-full font-semibold text-slate-900 dark:text-white bg-transparent border-none p-0 focus:ring-0 focus:outline-none truncate"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        {tier.minFico && (
                          <span className="text-[10px] text-slate-500">
                            FICO {tier.minFico}
                            {tier.maxFico ? `-${tier.maxFico}` : "+"}
                          </span>
                        )}
                        {tier.maxLtv && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            {tier.maxLtv}% LTV
                          </span>
                        )}
                        {tier.maxTerm && (
                          <span className="text-[10px] text-slate-500">
                            {tier.maxTerm}mo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateTier(index);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Duplicate Tier"
                    >
                      <Icons.DocumentDuplicateIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTier(index);
                      }}
                      disabled={(formData.tiers?.length || 0) <= 1}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30"
                      title="Remove Tier"
                    >
                      <Icons.TrashIcon className="w-4 h-4" />
                    </button>
                    <Icons.ChevronDownIcon
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        activeTierIndex === index ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Expanded Tier Details */}
                {activeTierIndex === index && (
                  <div className="p-4 space-y-4 bg-white dark:bg-slate-900/50">
                    {/* Credit & LTV Row */}
                    <div className="grid grid-cols-3 gap-3">
                      <TierField label="FICO Range">
                        <RangeInputPair
                          minName="minFico"
                          maxName="maxFico"
                          minValue={tier.minFico}
                          maxValue={tier.maxFico}
                          minPlaceholder="600"
                          maxPlaceholder="850"
                          onChange={(e) => handleTierChange(index, e)}
                        />
                      </TierField>
                      <TierField label="Max LTV %">
                        <Input
                          type="number"
                          name="maxLtv"
                          value={tier.maxLtv ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="125"
                          className="!px-2 text-center text-xs"
                        />
                      </TierField>
                      <TierField label="Max Term (mo)">
                        <Input
                          type="number"
                          name="maxTerm"
                          value={tier.maxTerm ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="84"
                          className="!px-2 text-center text-xs"
                        />
                      </TierField>
                    </div>

                    {/* Vehicle Requirements Row */}
                    <div className="grid grid-cols-3 gap-3">
                      <TierField label="Model Year">
                        <RangeInputPair
                          minName="minYear"
                          maxName="maxYear"
                          minValue={tier.minYear}
                          maxValue={tier.maxYear}
                          minPlaceholder="2018"
                          maxPlaceholder="2025"
                          onChange={(e) => handleTierChange(index, e)}
                        />
                      </TierField>
                      <TierField label="Mileage">
                        <RangeInputPair
                          minName="minMileage"
                          maxName="maxMileage"
                          minValue={tier.minMileage}
                          maxValue={tier.maxMileage}
                          minPlaceholder="0"
                          maxPlaceholder="100K"
                          onChange={(e) => handleTierChange(index, e)}
                        />
                      </TierField>
                      <TierField label="Amount Financed">
                        <RangeInputPair
                          minName="minAmountFinanced"
                          maxName="maxAmountFinanced"
                          minValue={tier.minAmountFinanced}
                          maxValue={tier.maxAmountFinanced}
                          minPlaceholder="$5K"
                          maxPlaceholder="$50K"
                          onChange={(e) => handleTierChange(index, e)}
                        />
                      </TierField>
                    </div>

                    {/* Advanced Options Row */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Advanced Options
                      </p>
                      <div className="grid grid-cols-4 gap-3">
                        <TierField label="Buy Rate %">
                          <Input
                            type="number"
                            name="baseInterestRate"
                            value={tier.baseInterestRate ?? ""}
                            onChange={(e) => handleTierChange(index, e)}
                            placeholder="5.99"
                            step="0.01"
                            className="!px-2 text-center text-xs"
                          />
                        </TierField>
                        <TierField label="Rate Adder %">
                          <Input
                            type="number"
                            name="rateAdder"
                            value={tier.rateAdder ?? ""}
                            onChange={(e) => handleTierChange(index, e)}
                            placeholder="+0.5"
                            step="0.01"
                            className="!px-2 text-center text-xs"
                          />
                        </TierField>
                        <TierField label="Max Backend $">
                          <Input
                            type="number"
                            name="maxBackend"
                            value={tier.maxBackend ?? ""}
                            onChange={(e) => handleTierChange(index, e)}
                            placeholder="3000"
                            className="!px-2 text-center text-xs"
                          />
                        </TierField>
                        <TierField label="Vehicle Type">
                          <select
                            name="vehicleType"
                            value={tier.vehicleType || ""}
                            onChange={(e) => handleTierChange(index, e as any)}
                            className="w-full h-9 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Any</option>
                            <option value="new">New</option>
                            <option value="used">Used</option>
                            <option value="certified">CPO</option>
                          </select>
                        </TierField>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Empty State */}
          {(formData.tiers?.length || 0) === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              <Icons.DocumentTextIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                No tiers defined
              </p>
              <p className="text-slate-400 dark:text-slate-500 text-sm mb-4">
                Add at least one credit tier
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={addTier}
              >
                <Icons.PlusIcon className="w-4 h-4 mr-1" />
                Add First Tier
              </Button>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default LenderProfileModal;
