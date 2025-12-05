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

        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              <Icons.ListIcon className="w-4 h-4 text-indigo-500" />
              Lending Tiers
            </h4>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addTier}
            >
              <Icons.PlusIcon className="w-4 h-4 mr-2" />
              Add Tier
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {(formData.tiers || []).map((tier, index) => (
              <div
                key={index}
                className="p-5 border rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative group transition-all hover:border-blue-400 dark:hover:border-blue-500/50"
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    disabled={(formData.tiers?.length || 0) <= 1}
                    onClick={() => removeTier(index)}
                    title="Remove Tier"
                    className="bg-red-50 hover:bg-red-100 text-red-600 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 dark:border-red-900/50"
                  >
                    <Icons.TrashIcon className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-6 xl:grid-cols-12 gap-4">
                  <div className="col-span-2 lg:col-span-2 xl:col-span-3">
                    <InputGroup label={`Tier ${index + 1} Name`}>
                      <Input
                        type="text"
                        name="name"
                        value={tier.name}
                        onChange={(e) => handleTierChange(index, e)}
                        required
                        placeholder="e.g. Tier 1+"
                        className="font-semibold text-blue-600 dark:text-blue-400"
                      />
                    </InputGroup>
                  </div>

                  <div className="col-span-2 lg:col-span-4 xl:col-span-9 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <InputGroup label="FICO Range">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          name="minFico"
                          value={tier.minFico ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center"
                        />
                        <span className="text-slate-400">-</span>
                        <Input
                          type="number"
                          name="maxFico"
                          value={tier.maxFico ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center"
                        />
                      </div>
                    </InputGroup>

                    <InputGroup label="LTV / Term">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          name="maxLtv"
                          value={tier.maxLtv ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="LTV %"
                          className="!px-2 text-center"
                        />
                        <span className="text-slate-400">/</span>
                        <Input
                          type="number"
                          name="maxTerm"
                          value={tier.maxTerm ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Mo"
                          className="!px-2 text-center"
                        />
                      </div>
                    </InputGroup>

                    <InputGroup label="Year Range">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          name="minYear"
                          value={tier.minYear ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center"
                        />
                        <span className="text-slate-400">-</span>
                        <Input
                          type="number"
                          name="maxYear"
                          value={tier.maxYear ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center"
                        />
                      </div>
                    </InputGroup>

                    <InputGroup label="Mileage Range">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          name="minMileage"
                          value={tier.minMileage ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center"
                        />
                        <span className="text-slate-400">-</span>
                        <Input
                          type="number"
                          name="maxMileage"
                          value={tier.maxMileage ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center"
                        />
                      </div>
                    </InputGroup>

                    <InputGroup label="Amount Financed">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          name="minAmountFinanced"
                          value={tier.minAmountFinanced ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Min"
                          className="!px-2 text-center"
                        />
                        <span className="text-slate-400">-</span>
                        <Input
                          type="number"
                          name="maxAmountFinanced"
                          value={tier.maxAmountFinanced ?? ""}
                          onChange={(e) => handleTierChange(index, e)}
                          placeholder="Max"
                          className="!px-2 text-center"
                        />
                      </div>
                    </InputGroup>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default LenderProfileModal;
