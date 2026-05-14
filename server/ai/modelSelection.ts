import {
  AI_PROVIDER_ORDER,
  getDefaultModelForTask,
  getModelsForTask,
  normalizeAiSettings,
  type AiProvider,
  type AiSettings,
  type AiTask,
} from "../../lib/aiModelRegistry";

export interface ProviderKeys {
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export interface ResolvedAiModel {
  provider: AiProvider;
  model: string;
  apiKey: string;
  warning?: string;
}

export const getProviderKeys = (env: NodeJS.ProcessEnv = process.env): ProviderKeys => ({
  openai: env.OPENAI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  gemini: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
});

export const getConfiguredProviders = (
  keys: ProviderKeys = getProviderKeys()
): Partial<Record<AiProvider, boolean>> => ({
  openai: Boolean(keys.openai),
  anthropic: Boolean(keys.anthropic),
  gemini: Boolean(keys.gemini),
});

const getRequestedModelForTask = (settings: AiSettings, task: AiTask): string => {
  switch (task) {
    case "lenderExtract":
      return settings.lenderExtractModel;
    case "dealAnalysis":
      return settings.dealAnalysisModel;
    case "quick":
      return settings.quickModel;
  }
};

const getFirstConfiguredProvider = (keys: ProviderKeys): AiProvider | null =>
  AI_PROVIDER_ORDER.find((provider) => Boolean(keys[provider])) ?? null;

const getTaskSafeModel = (provider: AiProvider, task: AiTask, requestedModel: string): string => {
  const models = getModelsForTask(provider, task);
  return models.some((model) => model.id === requestedModel)
    ? requestedModel
    : getDefaultModelForTask(provider, task);
};

export const resolveAiModel = (
  task: AiTask,
  requestedSettings: Partial<AiSettings> | undefined,
  keys: ProviderKeys = getProviderKeys()
): ResolvedAiModel => {
  const settings = normalizeAiSettings(requestedSettings);
  const requestedProvider = settings.provider;
  const requestedModel = getTaskSafeModel(
    requestedProvider,
    task,
    getRequestedModelForTask(settings, task)
  );
  const requestedKey = keys[requestedProvider];

  if (requestedKey) {
    return {
      provider: requestedProvider,
      model: requestedModel,
      apiKey: requestedKey,
    };
  }

  const fallbackProvider = getFirstConfiguredProvider(keys);
  if (!fallbackProvider) {
    throw new Error(
      "No AI provider is configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in your local server environment."
    );
  }

  const fallbackKey = keys[fallbackProvider];
  if (!fallbackKey) {
    throw new Error(`AI provider ${fallbackProvider} is missing its API key.`);
  }

  const fallbackModel = getDefaultModelForTask(fallbackProvider, task);
  return {
    provider: fallbackProvider,
    model: fallbackModel,
    apiKey: fallbackKey,
    warning: `${requestedProvider} is selected but not configured. Using ${fallbackProvider} with ${fallbackModel}.`,
  };
};
