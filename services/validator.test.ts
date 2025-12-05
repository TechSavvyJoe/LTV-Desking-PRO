import { describe, it, expect } from "vitest";
import { validateInput } from "./validator";

describe("validateInput", () => {
  describe("downPayment, backendProducts, stateFees, monthlyIncome, maxPrice, maxPayment", () => {
    const positiveOnlyFields = [
      "downPayment",
      "backendProducts",
      "stateFees",
      "monthlyIncome",
      "maxPrice",
      "maxPayment",
    ];

    positiveOnlyFields.forEach((field) => {
      it(`${field}: allows positive values`, () => {
        expect(validateInput(field, 1000)).toBeNull();
        expect(validateInput(field, 0)).toBeNull();
      });

      it(`${field}: rejects negative values`, () => {
        expect(validateInput(field, -100)).toBe("Value cannot be negative.");
      });

      it(`${field}: allows null (clears filter)`, () => {
        expect(validateInput(field, null)).toBeNull();
      });
    });
  });

  describe("loanTerm", () => {
    it("allows valid terms (12, 24, 60, 72, 84)", () => {
      expect(validateInput("loanTerm", 12)).toBeNull();
      expect(validateInput("loanTerm", 60)).toBeNull();
      expect(validateInput("loanTerm", 84)).toBeNull();
    });

    it("rejects non-integer values", () => {
      expect(validateInput("loanTerm", 60.5)).toBe(
        "Term must be a positive whole number."
      );
    });

    it("rejects zero or negative", () => {
      expect(validateInput("loanTerm", 0)).toBe(
        "Term must be a positive whole number."
      );
      expect(validateInput("loanTerm", -12)).toBe(
        "Term must be a positive whole number."
      );
    });

    it("rejects terms over 120 months", () => {
      expect(validateInput("loanTerm", 121)).toBe(
        "Term is unusually high (max 120 mo)."
      );
    });

    it("allows 120 months", () => {
      expect(validateInput("loanTerm", 120)).toBeNull();
    });
  });

  describe("interestRate", () => {
    it("allows valid rates (0, 5.99, 29.99)", () => {
      expect(validateInput("interestRate", 0)).toBeNull();
      expect(validateInput("interestRate", 5.99)).toBeNull();
      expect(validateInput("interestRate", 29.99)).toBeNull();
    });

    it("rejects negative rates", () => {
      expect(validateInput("interestRate", -1)).toBe(
        "Interest rate cannot be negative."
      );
    });

    it("rejects rates over 50%", () => {
      expect(validateInput("interestRate", 51)).toBe(
        "Interest rate seems high (max 50%)."
      );
    });

    it("allows 50%", () => {
      expect(validateInput("interestRate", 50)).toBeNull();
    });
  });

  describe("creditScore", () => {
    it("allows valid scores (300-850)", () => {
      expect(validateInput("creditScore", 300)).toBeNull();
      expect(validateInput("creditScore", 650)).toBeNull();
      expect(validateInput("creditScore", 850)).toBeNull();
    });

    it("allows 0 as empty filter", () => {
      expect(validateInput("creditScore", 0)).toBeNull();
    });

    it("rejects non-integer values", () => {
      expect(validateInput("creditScore", 650.5)).toBe(
        "Score must be a whole number."
      );
    });

    it("rejects scores below 300", () => {
      expect(validateInput("creditScore", 299)).toBe(
        "Credit score must be between 300 and 850."
      );
    });

    it("rejects scores above 850", () => {
      expect(validateInput("creditScore", 851)).toBe(
        "Credit score must be between 300 and 850."
      );
    });
  });

  describe("unknown fields", () => {
    it("returns null for unknown field IDs", () => {
      expect(validateInput("unknownField", 1000)).toBeNull();
      expect(validateInput("randomInput", -500)).toBeNull();
    });
  });
});
