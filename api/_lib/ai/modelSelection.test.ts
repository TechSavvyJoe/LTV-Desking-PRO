import { describe, expect, it } from "vitest";
import { AI_MODELS, getDefaultModelForTask, getModelsForTask } from "../../../lib/aiModelRegistry";
import { resolveAiModel } from "./modelSelection";

describe("AI model registry and selection", () => {
  it("contains current top and fast models without deprecated Gemini 3 Pro Preview", () => {
    const modelIds = AI_MODELS.map((model) => model.id);

    expect(modelIds).toContain("gpt-5.5");
    expect(modelIds).toContain("gpt-5.4-mini");
    expect(modelIds).toContain("claude-opus-4-7");
    expect(modelIds).toContain("claude-haiku-4-5");
    expect(modelIds).toContain("gemini-3.1-pro-preview");
    expect(modelIds).toContain("gemini-3.1-flash-lite");
    expect(modelIds).not.toContain("gemini-3-pro-preview");
  });

  it("orders defaults by workflow quality needs", () => {
    expect(getDefaultModelForTask("openai", "lenderExtract")).toBe("gpt-5.5");
    expect(getDefaultModelForTask("anthropic", "dealAnalysis")).toBe("claude-sonnet-4-6");
    expect(getDefaultModelForTask("gemini", "quick")).toBe("gemini-3.1-flash-lite");
    expect(getModelsForTask("openai", "quick").map((model) => model.id)).toContain("gpt-5.4-mini");
  });

  it("falls back to the first configured provider when selected provider key is missing", () => {
    const resolved = resolveAiModel(
      "dealAnalysis",
      {
        provider: "anthropic",
        dealAnalysisModel: "claude-sonnet-4-6",
      },
      { gemini: "gemini-key" }
    );

    expect(resolved.provider).toBe("gemini");
    expect(resolved.model).toBe("gemini-3-flash-preview");
    expect(resolved.warning).toContain("anthropic is selected but not configured");
  });

  it("rejects requests when no provider key is configured", () => {
    expect(() =>
      resolveAiModel("quick", { provider: "openai", quickModel: "gpt-5.4-mini" }, {})
    ).toThrow("No AI provider is configured");
  });
});
