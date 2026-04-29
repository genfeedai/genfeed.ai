import { randomUUID } from 'node:crypto';
import type {
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
  IDesktopGenerationProviderPublicConfig,
  IDesktopGenerationProviderTestResult,
  IDesktopWorkflowGenerationOptions,
  IDesktopWorkflowGenerationResult,
} from '@genfeedai/desktop-contracts';
import {
  buildWorkflowGenerationMessages,
  DEFAULT_WORKFLOW_GENERATION_NODE_TYPES,
  parseWorkflowGenerationResponse,
} from '@genfeedai/workflows';
import type { DesktopDatabaseService, SyncJobRow } from './database.service';

const PROVIDER_CONFIG_KEY = 'desktop.generation.provider';
const GENERATION_JOB_TYPE = 'generation';

type ChatCompletionMessage = {
  content?: unknown;
};

type ChatCompletionChoice = {
  message?: ChatCompletionMessage;
  text?: unknown;
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
};

const toIso = (): string => new Date().toISOString();

const providerDisplayName = (
  config: IDesktopGenerationProviderConfig,
): string => {
  if (config.displayName?.trim()) {
    return config.displayName.trim();
  }

  if (config.provider === 'ollama') {
    return 'Ollama';
  }

  if (config.provider === 'lm-studio') {
    return 'LM Studio';
  }

  return 'OpenAI-compatible';
};

const parseProviderConfig = (
  rawValue: string | null,
): IDesktopGenerationProviderConfig | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      rawValue,
    ) as Partial<IDesktopGenerationProviderConfig>;
    if (
      !parsed.baseUrl ||
      !parsed.model ||
      !parsed.provider ||
      typeof parsed.baseUrl !== 'string' ||
      typeof parsed.model !== 'string' ||
      typeof parsed.provider !== 'string'
    ) {
      return null;
    }

    return {
      apiKey:
        typeof parsed.apiKey === 'string' && parsed.apiKey.trim()
          ? parsed.apiKey.trim()
          : undefined,
      baseUrl: parsed.baseUrl,
      displayName:
        typeof parsed.displayName === 'string' && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : undefined,
      model: parsed.model,
      provider: parsed.provider as IDesktopGenerationProviderConfig['provider'],
    };
  } catch {
    return null;
  }
};

const normalizeProviderConfig = (
  config: IDesktopGenerationProviderConfig,
): IDesktopGenerationProviderConfig => {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const model = config.model.trim();

  if (!baseUrl) {
    throw new Error('Local provider base URL is required.');
  }

  if (!model) {
    throw new Error('Local provider model is required.');
  }

  return {
    apiKey: config.apiKey?.trim() || undefined,
    baseUrl,
    displayName: config.displayName?.trim() || undefined,
    model,
    provider: config.provider,
  };
};

const toPublicConfig = (
  config: IDesktopGenerationProviderConfig,
): IDesktopGenerationProviderPublicConfig => ({
  apiKeyConfigured: Boolean(config.apiKey),
  baseUrl: config.baseUrl,
  displayName: providerDisplayName(config),
  model: config.model,
  provider: config.provider,
});

const buildCompletionUrl = (baseUrl: string): string => {
  if (baseUrl.endsWith('/chat/completions')) {
    return baseUrl;
  }

  return `${baseUrl}/chat/completions`;
};

const buildSystemPrompt = (): string =>
  [
    'You are Genfeed Desktop, an offline-first content generation assistant.',
    'Generate practical, ready-to-edit content for a creator workflow.',
    'Do not mention that you are a local model or that you lack cloud access.',
  ].join(' ');

const buildUserPrompt = (params: IDesktopGenerationOptions): string => {
  const source = params.sourceTrendTopic
    ? `Source trend: ${params.sourceTrendTopic}`
    : `Prompt: ${params.prompt.trim()}`;

  return [
    `Platform: ${params.platform}`,
    `Output type: ${params.type}`,
    `Publish intent: ${params.publishIntent}`,
    source,
    '',
    'Return only the generated content. Keep it specific, concrete, and usable.',
  ].join('\n');
};

const extractCompletionText = (payload: ChatCompletionResponse): string => {
  const firstChoice = payload.choices?.[0];
  const content = firstChoice?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((entry) => {
        if (
          entry &&
          typeof entry === 'object' &&
          'text' in entry &&
          typeof entry.text === 'string'
        ) {
          return entry.text;
        }

        return '';
      })
      .join('')
      .trim();

    if (text) {
      return text;
    }
  }

  if (typeof firstChoice?.text === 'string' && firstChoice.text.trim()) {
    return firstChoice.text.trim();
  }

  throw new Error('Local provider returned an empty completion.');
};

const buildGenerationPayload = (params: IDesktopGenerationOptions): string =>
  JSON.stringify({
    platform: params.platform,
    projectId: params.projectId,
    prompt: params.prompt,
    publishIntent: params.publishIntent,
    sourceDraftId: params.sourceDraftId,
    sourceTrendId: params.sourceTrendId,
    sourceTrendTopic: params.sourceTrendTopic,
    type: params.type,
  });

const buildProviderHeaders = (
  config: IDesktopGenerationProviderConfig,
): Record<string, string> => ({
  ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  'Content-Type': 'application/json',
});

export class DesktopGenerationService {
  constructor(private readonly database: DesktopDatabaseService) {}

  async clearProviderConfig(): Promise<void> {
    await this.database.deleteValue(PROVIDER_CONFIG_KEY);
  }

  async getProviderConfig(): Promise<IDesktopGenerationProviderConfig | null> {
    return parseProviderConfig(
      await this.database.getValue(PROVIDER_CONFIG_KEY),
    );
  }

  async getPublicProviderConfig(): Promise<IDesktopGenerationProviderPublicConfig | null> {
    const config = await this.getProviderConfig();
    return config ? toPublicConfig(config) : null;
  }

  async saveProviderConfig(
    config: IDesktopGenerationProviderConfig,
  ): Promise<IDesktopGenerationProviderPublicConfig> {
    const existingConfig = await this.getProviderConfig();
    const normalizedConfig = normalizeProviderConfig({
      ...config,
      apiKey:
        config.apiKey ??
        (existingConfig &&
        existingConfig.baseUrl === config.baseUrl.trim().replace(/\/+$/, '') &&
        existingConfig.model === config.model.trim() &&
        existingConfig.provider === config.provider
          ? existingConfig.apiKey
          : undefined),
    });
    await this.database.setValue(
      PROVIDER_CONFIG_KEY,
      JSON.stringify(normalizedConfig),
    );

    return toPublicConfig(normalizedConfig);
  }

  async testProviderConfig(
    config?: IDesktopGenerationProviderConfig,
  ): Promise<IDesktopGenerationProviderTestResult> {
    const providerConfig = config
      ? normalizeProviderConfig(config)
      : await this.requireProviderConfig();
    const startedAt = Date.now();
    const output = await this.requestCompletion(providerConfig, [
      {
        content: buildSystemPrompt(),
        role: 'system',
      },
      {
        content: 'Reply with the word OK and nothing else.',
        role: 'user',
      },
    ]);

    return {
      latencyMs: Date.now() - startedAt,
      ok: true,
      outputPreview: output.slice(0, 120),
    };
  }

  async generateContent(params: IDesktopGenerationOptions): Promise<string> {
    const config = await this.requireProviderConfig();
    const job = await this.createGenerationJob(params);

    try {
      const content = await this.requestCompletion(config, [
        {
          content: buildSystemPrompt(),
          role: 'system',
        },
        {
          content: buildUserPrompt(params),
          role: 'user',
        },
      ]);

      await this.updateGenerationJob(job, 'completed');
      return content;
    } catch (error) {
      await this.updateGenerationJob(
        job,
        'failed',
        error instanceof Error ? error.message : 'Generation failed.',
      );
      throw error;
    }
  }

  async generateWorkflow(
    params: IDesktopWorkflowGenerationOptions,
  ): Promise<IDesktopWorkflowGenerationResult> {
    const config = await this.requireProviderConfig();
    const messages = buildWorkflowGenerationMessages({
      availableNodeTypes: DEFAULT_WORKFLOW_GENERATION_NODE_TYPES,
      description: params.description,
      targetPlatforms: params.targetPlatforms,
    });
    const raw = await this.requestCompletion(config, messages);

    return {
      tokensUsed: 0,
      workflow: parseWorkflowGenerationResponse(raw).workflow,
    };
  }

  private async createGenerationJob(
    params: IDesktopGenerationOptions,
  ): Promise<SyncJobRow> {
    const now = toIso();
    const row: SyncJobRow = {
      createdAt: now,
      error: null,
      id: randomUUID(),
      payload: buildGenerationPayload(params),
      retryCount: 0,
      status: 'running',
      type: GENERATION_JOB_TYPE,
      updatedAt: now,
      workspaceId: null,
    };

    await this.database.upsertSyncJob(row);
    return row;
  }

  private async requestCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: Array<{ content: string; role: 'system' | 'user' }>,
  ): Promise<string> {
    const response = await fetch(buildCompletionUrl(config.baseUrl), {
      body: JSON.stringify({
        messages,
        model: config.model,
        temperature: 0.7,
      }),
      headers: buildProviderHeaders(config),
      method: 'POST',
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Local provider request failed (${String(response.status)}): ${
          responseText || response.statusText
        }`,
      );
    }

    try {
      return extractCompletionText(
        JSON.parse(responseText) as ChatCompletionResponse,
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Local provider returned an invalid response.');
    }
  }

  private async requireProviderConfig(): Promise<IDesktopGenerationProviderConfig> {
    const config = await this.getProviderConfig();
    if (!config) {
      throw new Error(
        'Configure a local generation provider before generating content.',
      );
    }

    return config;
  }

  private async updateGenerationJob(
    job: SyncJobRow,
    status: SyncJobRow['status'],
    error?: string,
  ): Promise<void> {
    await this.database.upsertSyncJob({
      ...job,
      error: error ?? null,
      status,
      updatedAt: toIso(),
    });
  }
}

export const __desktopGenerationServiceTestUtils = {
  buildCompletionUrl,
  buildUserPrompt,
  extractCompletionText,
  normalizeProviderConfig,
};
