import React, { useState, useEffect } from "react";
import type { LenderProfile, LenderTier } from "../types";
import Button from "./common/Button";

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

interface InputGroupProps {
  label: string;
  children: React.ReactNode;
}
const InputGroup: React.FC<InputGroupProps> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-200 mb-1">
      {label}
    </label>
    {children}
  </div>
);

const StyledInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2.5 text-base bg-slate-900 border border-slate-700 rounded-xl placeholder-slate-500 text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 transition-colors duration-200 ease-in-out shadow-sm"
  />
);

const StyledSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2.5 text-base bg-slate-900 border border-slate-700 rounded-xl placeholder-slate-500 text-slate-100 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40 transition-colors duration-200 ease-in-out shadow-sm"
  />
);

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
    const isNumber = e.target.type === "number";
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
      alert("A lender must have at least one tier.");
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
      alert("Lender Name is required.");
      return;
    }
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">
            {profile ? `Edit ${formData.name}` : "Add New Lender"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 flex-grow">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4 mb-6">
            <div className="sm:col-span-2 lg:col-span-1">
              <InputGroup label="Lender Name">
                <StyledInput
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleGeneralChange}
                  required
                />
              </InputGroup>
            </div>
            <InputGroup label="Book Value Source">
              <StyledSelect
                name="bookValueSource"
                value={formData.bookValueSource || "Trade"}
                onChange={handleGeneralChange}
              >
                <option value="Trade">JD Power Trade</option>
                <option value="Retail">JD Power Retail</option>
              </StyledSelect>
            </InputGroup>
            <InputGroup label="Min Monthly Income ($)">
              <StyledInput
                type="number"
                name="minIncome"
                value={formData.minIncome || ""}
                onChange={handleGeneralChange}
                min="0"
              />
            </InputGroup>
            <InputGroup label="Max PTI (%)">
              <StyledInput
                type="number"
                name="maxPti"
                value={formData.maxPti || ""}
                onChange={handleGeneralChange}
                min="0"
              />
            </InputGroup>
          </div>

          <h3 className="text-lg font-semibold text-white mb-4">
            Lending Tiers
          </h3>
          <div className="space-y-4">
            {(formData.tiers || []).map((tier, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg border-slate-800 bg-slate-900 relative"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="col-span-2 md:col-span-4 lg:col-span-2">
                    <InputGroup label="Tier Name">
                      <StyledInput
                        type="text"
                        name="name"
                        value={tier.name}
                        onChange={(e) => handleTierChange(index, e)}
                        required
                      />
                    </InputGroup>
                  </div>
                  <InputGroup label="Min FICO">
                    <StyledInput
                      type="number"
                      name="minFico"
                      value={tier.minFico ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max FICO">
                    <StyledInput
                      type="number"
                      name="maxFico"
                      value={tier.maxFico ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Min Year">
                    <StyledInput
                      type="number"
                      name="minYear"
                      value={tier.minYear ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max Year">
                    <StyledInput
                      type="number"
                      name="maxYear"
                      value={tier.maxYear ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Min Mileage">
                    <StyledInput
                      type="number"
                      name="minMileage"
                      value={tier.minMileage ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max Mileage">
                    <StyledInput
                      type="number"
                      name="maxMileage"
                      value={tier.maxMileage ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Min Term (mo)">
                    <StyledInput
                      type="number"
                      name="minTerm"
                      value={tier.minTerm ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max Term (mo)">
                    <StyledInput
                      type="number"
                      name="maxTerm"
                      value={tier.maxTerm ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max LTV (%)">
                    <StyledInput
                      type="number"
                      name="maxLtv"
                      value={tier.maxLtv ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Min Fin. ($)">
                    <StyledInput
                      type="number"
                      name="minAmountFinanced"
                      value={tier.minAmountFinanced ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                  <InputGroup label="Max Fin. ($)">
                    <StyledInput
                      type="number"
                      name="maxAmountFinanced"
                      value={tier.maxAmountFinanced ?? ""}
                      onChange={(e) => handleTierChange(index, e)}
                    />
                  </InputGroup>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="!p-1.5 !rounded-full absolute top-2 right-2"
                  onClick={() => removeTier(index)}
                >
                  &times;
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addTier}
            className="mt-4"
          >
            Add Tier
          </Button>
        </form>
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit}>
            Save Profile
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LenderProfileModal;
