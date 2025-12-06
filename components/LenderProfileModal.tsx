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

const LenderProfileModal: React.FC<LenderProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<LenderProfile>({
    id: "",
    name: "New Lender",
    tiers: [],
    ...NEW_PROFILE_TEMPLATE,
  });

  useEffect(() => {
    if (profile) {
      // Critical fix: Ensure tiers is initialized as an array even if the profile has it as undefined
      setFormData({
        ...profile,
        tiers: Array.isArray(profile.tiers) ? profile.tiers : [],
      });
    } else {
      setFormData({ id: "", name: "", tiers: [], ...NEW_PROFILE_TEMPLATE });
    }
  }, [profile, isOpen]);

  const handleGeneralChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    // For Select, type might not be "number", so check the name or schema if needed
    // But here bookValueSource is likely the only select and it's string.
    // minIncome/maxPti are numbers.
    const isNumber =
      e.target.type === "number" || name === "minIncome" || name === "maxPti";

    setFormData((prev) => ({
      ...prev,
      [name]: isNumber ? (value ? Number(value) : 0) : value,
    }));
  };

  const handleTierChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const isNumber = e.target.type === "number";
    // Ensure tiers exists before accessing
    const updatedTiers = [...(formData.tiers || [])];
    if (updatedTiers[index]) {
      updatedTiers[index] = {
        ...updatedTiers[index],
        [name]: value === "" ? undefined : isNumber ? Number(value) : value,
      };
      setFormData((prev) => ({ ...prev, tiers: updatedTiers }));
    }
  };

  const addTier = () => {
    // Ensure tiers exists
    const currentTiers = formData.tiers || [];
    const lastTier =
      currentTiers.length > 0 ? currentTiers[currentTiers.length - 1] : {};
    const newTier = {
      ...lastTier,
      name: `Tier ${(currentTiers.length || 0) + 1}`,
    };
    setFormData((prev) => ({ ...prev, tiers: [...currentTiers, newTier] }));
  };

  const removeTier = (index: number) => {
    const currentTiers = formData.tiers || [];
    if (currentTiers.length <= 1) {
      // Could use a tailored toast here, but alert is acceptable fallback for now
      // Or better, just don't do anything or shake the UI.
      return;
    }
    setFormData((prev) => ({
      ...prev,
      tiers: currentTiers.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      // Maybe show standard validation error on the input instead
      return;
    }
    onSave(formData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={profile ? `Edit ${formData.name}` : "Add New Lender"}
      description="Configure lending parameters and tier structures."
      size="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} className="ml-auto">
            <Icons.SaveIcon className="w-4 h-4 mr-2" />
            Save Profile
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-8 pb-4">
        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <h4 className="flex items-center gap-2 mb-4 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">
            <Icons.BuildingLibraryIcon className="w-4 h-4 text-blue-500" />
            General Settings
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="sm:col-span-2 lg:col-span-1">
              <InputGroup label="Lender Name" htmlFor="name">
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
            <InputGroup label="Min Monthly Income ($)" htmlFor="minIncome">
              <Input
                type="number"
                id="minIncome"
                name="minIncome"
                value={formData.minIncome || ""}
                onChange={handleGeneralChange}
                min="0"
                placeholder="0"
              />
            </InputGroup>
            <InputGroup label="Max PTI (%)" htmlFor="maxPti">
              <Input
                type="number"
                id="maxPti"
                name="maxPti"
                value={formData.maxPti || ""}
                onChange={handleGeneralChange}
                min="0"
                max="100"
                placeholder="0"
              />
            </InputGroup>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Icons.ListIcon className="w-4 h-4 text-indigo-500" />
              Lending Tiers ({(formData.tiers || []).length})
            </h4>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addTier}
            >
              <Icons.PlusIcon className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Compact Tier List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
            {(formData.tiers || []).map((tier, index) => (
              <details
                key={index}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-blue-400 dark:hover:border-blue-500/50 transition-colors"
              >
                {/* Compact Summary Row */}
                <summary className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none list-none hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <Icons.ChevronDownIcon className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
                  <div className="flex-1 flex items-center gap-4 min-w-0">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
                      {tier.name || `Tier ${index + 1}`}
                    </span>
                    <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      {tier.minFico && (
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          FICO: {tier.minFico}
                          {tier.maxFico ? `-${tier.maxFico}` : "+"}
                        </span>
                      )}
                      {tier.maxLtv && (
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          LTV: {tier.maxLtv}%
                        </span>
                      )}
                      {tier.maxTerm && (
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Term: {tier.maxTerm}mo
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      removeTier(index);
                    }}
                    disabled={(formData.tiers?.length || 0) <= 1}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove Tier"
                  >
                    <Icons.TrashIcon className="w-4 h-4" />
                  </button>
                </summary>

                {/* Expandable Details */}
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  {/* Tier Name */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Tier Name
                    </label>
                    <Input
                      type="text"
                      name="name"
                      value={tier.name}
                      onChange={(e) => handleTierChange(index, e)}
                      required
                      placeholder="e.g. Tier 1+"
                      className="font-semibold"
                    />
                  </div>

                  {/* Compact 2-Column Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* FICO Range */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        FICO Range
                      </label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          name="minFico"
                          value={tier.minFico ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center text-sm"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <Input
                          type="number"
                          name="maxFico"
                          value={tier.maxFico ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center text-sm"
                        />
                      </div>
                    </div>

                    {/* Max LTV */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Max LTV %
                      </label>
                      <Input
                        type="number"
                        name="maxLtv"
                        value={tier.maxLtv ?? ""}
                        onChange={(e) => handleTierChange(index, e)}
                        placeholder="125"
                        className="!px-2 text-center text-sm"
                      />
                    </div>

                    {/* Max Term */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Max Term (mo)
                      </label>
                      <Input
                        type="number"
                        name="maxTerm"
                        value={tier.maxTerm ?? ""}
                        onChange={(e) => handleTierChange(index, e)}
                        placeholder="72"
                        className="!px-2 text-center text-sm"
                      />
                    </div>

                    {/* Year Range */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Year Range
                      </label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          name="minYear"
                          value={tier.minYear ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center text-sm"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <Input
                          type="number"
                          name="maxYear"
                          value={tier.maxYear ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center text-sm"
                        />
                      </div>
                    </div>

                    {/* Mileage Range */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Mileage Range
                      </label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          name="minMileage"
                          value={tier.minMileage ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center text-sm"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <Input
                          type="number"
                          name="maxMileage"
                          value={tier.maxMileage ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center text-sm"
                        />
                      </div>
                    </div>

                    {/* Amount Financed */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Amount Financed
                      </label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          name="minAmountFinanced"
                          value={tier.minAmountFinanced ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center text-sm"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <Input
                          type="number"
                          name="maxAmountFinanced"
                          value={tier.maxAmountFinanced ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default LenderProfileModal;
