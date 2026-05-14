export type AiProvider = "openai" | "anthropic" | "gemini";
export type AiTask = "lenderExtract" | "dealAnalysis" | "quick";
export type AiModelTier = "top" | "pro" | "balanced" | "fast" | "alias";

export interface AiModelInfo {
  id: string;
  label: string;
  provider: AiProvider;
  tier: AiModelTier;
  tasks: AiTask[];
  description: string;
  supportsPdf: boolean;
  isPreview?: boolean;
  isAlias?: boolean;
}

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  configured?: boolean;
  models: AiModelInfo[];
}

export interface AiModelRegistryResponse {
  verifiedDate: string;
  providers: AiProviderInfo[];
  warnings: string[];
  sources: { label: string; url: string }[];
}

export interface AiSettings {
  provider: AiProvider;
  lenderExtractModel: string;
  dealAnalysisModel: string;
  quickModel: string;
}

export const AI_MODEL_DOCS_VERIFIED_DATE = "2026-05-14";

export const AI_MODEL_SOURCES = [
  {
    label: "OpenAI models",
    url: "https://developers.openai.com/api/docs/models",
  },
  {
    label: "OpenAI all models",
    url: "https://developers.openai.com/api/docs/models/all",
  },
  {
    label: "Anthropic models",
    url: "https://platform.claude.com/docs/en/about-claude/models/overview",
  },
  {
    label: "Anthropic model IDs",
    url: "https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions",
  },
  {
    label: "Gemini models",
    url: "https://ai.google.dev/gemini-api/docs/models",
  },
] as const;

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "openai",
    tier: "top",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Top OpenAI model for complex reasoning and multimodal extraction.",
    supportsPdf: true,
  },
  {
    id: "gpt-5.5-pro",
    label: "GPT-5.5 Pro",
    provider: "openai",
    tier: "pro",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Highest-quality OpenAI option when latency and cost matter less.",
    supportsPdf: true,
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
    tier: "balanced",
    tasks: ["dealAnalysis", "quick"],
    description: "Balanced OpenAI option for everyday deal analysis.",
    supportsPdf: true,
  },
  {
    id: "gpt-5.4-pro",
    label: "GPT-5.4 Pro",
    provider: "openai",
    tier: "pro",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Pro fallback for OpenAI reasoning workloads.",
    supportsPdf: true,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "openai",
    tier: "fast",
    tasks: ["dealAnalysis", "quick"],
    description: "Fast OpenAI model for lower-latency analysis and validation.",
    supportsPdf: true,
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    provider: "openai",
    tier: "fast",
    tasks: ["quick"],
    description: "Fastest OpenAI option for lightweight classification and routing.",
    supportsPdf: false,
  },
  {
    id: "chat-latest",
    label: "ChatGPT latest",
    provider: "openai",
    tier: "alias",
    tasks: ["dealAnalysis", "quick"],
    description: "Moving ChatGPT alias for dealers who want the current ChatGPT model.",
    supportsPdf: true,
    isAlias: true,
  },
  {
    id: "gpt-5.5-chat-latest",
    label: "GPT-5.5 Chat Latest",
    provider: "openai",
    tier: "alias",
    tasks: ["dealAnalysis", "quick"],
    description: "OpenAI ChatGPT-style latest GPT-5.5 chat entry.",
    supportsPdf: true,
    isAlias: true,
  },
  {
    id: "gpt-5.3-chat",
    label: "GPT-5.3 Chat",
    provider: "openai",
    tier: "balanced",
    tasks: ["dealAnalysis", "quick"],
    description: "Visible ChatGPT model entry retained for compatibility.",
    supportsPdf: true,
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    tier: "top",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Top Anthropic model for complex lender extraction and reasoning.",
    supportsPdf: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    tier: "balanced",
    tasks: ["lenderExtract", "dealAnalysis", "quick"],
    description: "Balanced Anthropic model for fast, capable desk work.",
    supportsPdf: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    tier: "fast",
    tasks: ["dealAnalysis", "quick"],
    description: "Fast Anthropic model for quick checks and low-latency workflows.",
    supportsPdf: true,
    isAlias: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 pinned",
    provider: "anthropic",
    tier: "fast",
    tasks: ["quick"],
    description: "Pinned Haiku 4.5 version for repeatable fast results.",
    supportsPdf: true,
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    provider: "gemini",
    tier: "top",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Top Gemini model replacing the deprecated Gemini 3 Pro Preview.",
    supportsPdf: true,
    isPreview: true,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    provider: "gemini",
    tier: "balanced",
    tasks: ["lenderExtract", "dealAnalysis", "quick"],
    description: "Balanced Gemini option for faster extraction and analysis.",
    supportsPdf: true,
    isPreview: true,
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    tier: "fast",
    tasks: ["dealAnalysis", "quick"],
    description: "Stable fast Gemini model for quick validations.",
    supportsPdf: true,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite Preview",
    provider: "gemini",
    tier: "fast",
    tasks: ["dealAnalysis", "quick"],
    description: "Preview fast Gemini model when newest low-latency behavior is needed.",
    supportsPdf: true,
    isPreview: true,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    tier: "pro",
    tasks: ["lenderExtract", "dealAnalysis"],
    description: "Stable Gemini fallback for high-quality reasoning.",
    supportsPdf: true,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    provider: "gemini",
    tier: "fast",
    tasks: ["dealAnalysis", "quick"],
    description: "Stable Gemini fallback for fast workflows.",
    supportsPdf: true,
  },
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "gemini",
  lenderExtractModel: "gemini-3.1-pro-preview",
  dealAnalysisModel: "gemini-3-flash-preview",
  quickModel: "gemini-3.1-flash-lite",
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI / ChatGPT",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
};

const DEFAULT_MODEL_BY_PROVIDER_AND_TASK: Record<AiProvider, Record<AiTask, string>> = {
  openai: {
    lenderExtract: "gpt-5.5",
    dealAnalysis: "gpt-5.4",
    quick: "gpt-5.4-mini",
  },
  anthropic: {
    lenderExtract: "claude-opus-4-7",
    dealAnalysis: "claude-sonnet-4-6",
    quick: "claude-haiku-4-5",
  },
  gemini: {
    lenderExtract: "gemini-3.1-pro-preview",
    dealAnalysis: "gemini-3-flash-preview",
    quick: "gemini-3.1-flash-lite",
  },
};

export const AI_PROVIDER_ORDER: AiProvider[] = ["openai", "anthropic", "gemini"];

export const getAiProviderLabel = (provider: AiProvider): string => PROVIDER_LABELS[provider];

export const getModelsForProvider = (provider: AiProvider): AiModelInfo[] =>
  AI_MODELS.filter((model) => model.provider === provider);

export const getModelsForTask = (provider: AiProvider, task: AiTask): AiModelInfo[] =>
  getModelsForProvider(provider).filter((model) => model.tasks.includes(task));

export const getDefaultModelForTask = (provider: AiProvider, task: AiTask): string =>
  DEFAULT_MODEL_BY_PROVIDER_AND_TASK[provider][task];

export const getModelById = (modelId: string): AiModelInfo | undefined =>
  AI_MODELS.find((model) => model.id === modelId);

export const normalizeAiSettings = (settings?: Partial<AiSettings>): AiSettings => {
  const provider =
    settings?.provider && AI_PROVIDER_ORDER.includes(settings.provider)
      ? settings.provider
      : DEFAULT_AI_SETTINGS.provider;

  const fallback = {
    provider,
    lenderExtractModel: getDefaultModelForTask(provider, "lenderExtract"),
    dealAnalysisModel: getDefaultModelForTask(provider, "dealAnalysis"),
    quickModel: getDefaultModelForTask(provider, "quick"),
  };

  return {
    provider,
    lenderExtractModel:
      settings?.lenderExtractModel &&
      getModelsForTask(provider, "lenderExtract").some(
        (model) => model.id === settings.lenderExtractModel
      )
        ? settings.lenderExtractModel
        : fallback.lenderExtractModel,
    dealAnalysisModel:
      settings?.dealAnalysisModel &&
      getModelsForTask(provider, "dealAnalysis").some(
        (model) => model.id === settings.dealAnalysisModel
      )
        ? settings.dealAnalysisModel
        : fallback.dealAnalysisModel,
    quickModel:
      settings?.quickModel &&
      getModelsForTask(provider, "quick").some((model) => model.id === settings.quickModel)
        ? settings.quickModel
        : fallback.quickModel,
  };
};

export const buildAiModelRegistryResponse = (
  configuredProviders: Partial<Record<AiProvider, boolean>> = {}
): AiModelRegistryResponse => ({
  verifiedDate: AI_MODEL_DOCS_VERIFIED_DATE,
  providers: AI_PROVIDER_ORDER.map((provider) => ({
    id: provider,
    label: getAiProviderLabel(provider),
    configured: Boolean(configuredProviders[provider]),
    models: getModelsForProvider(provider),
  })),
  warnings: [],
  sources: [...AI_MODEL_SOURCES],
});
