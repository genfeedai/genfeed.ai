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

type ProviderOutputPayload = {
  completed_at?: unknown;
  detail?: unknown;
  error?: unknown;
  id?: unknown;
  logs?: unknown;
  output?: unknown;
  request_id?: unknown;
  response_url?: unknown;
  status?: unknown;
  status_url?: unknown;
  urls?: {
    get?: unknown;
    stream?: unknown;
  };
};

const toIso = (): string => new Date().toISOString();

const isReplicatePendingStatus = (status: string): boolean =>
  ['queued', 'processing', 'starting'].includes(status.toLowerCase());

const isReplicateSucceededStatus = (status: string): boolean =>
  status.toLowerCase() === 'succeeded';

const isReplicateFailedStatus = (status: string): boolean =>
  ['canceled', 'cancelled', 'failed'].includes(status.toLowerCase());

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

  if (config.provider === 'replicate') {
    return 'Replicate';
  }

  if (config.provider === 'fal') {
    return 'fal.ai';
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

const extractProviderOutputText = (payload: ProviderOutputPayload): string => {
  const output = payload.output;

  if (typeof output === 'string' && output.trim()) {
    return output.trim();
  }

  if (Array.isArray(output)) {
    const text = output
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }

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

  if (output && typeof output === 'object') {
    const outputRecord = output as Record<string, unknown>;
    for (const key of ['text', 'content', 'message']) {
      if (typeof outputRecord[key] === 'string' && outputRecord[key].trim()) {
        return outputRecord[key].trim();
      }
    }
  }

  throw new Error('Provider returned an empty generation output.');
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
    if (config.provider === 'replicate') {
      return this.requestReplicateCompletion(config, messages);
    }

    if (config.provider === 'fal') {
      return this.requestFalCompletion(config, messages);
    }

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

  private buildProviderPrompt(
    messages: Array<{ content: string; role: 'system' | 'user' }>,
  ): string {
    return messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n');
  }

  private async requestReplicateCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: Array<{ content: string; role: 'system' | 'user' }>,
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('Replicate provider requires an API key.');
    }

    const [owner, modelName] = config.model.split('/');
    if (!owner || !modelName) {
      throw new Error('Replicate model must use owner/model format.');
    }

    const response = await fetch(
      `${config.baseUrl}/models/${encodeURIComponent(owner)}/${encodeURIComponent(modelName)}/predictions`,
      {
        body: JSON.stringify({
          input: {
            prompt: this.buildProviderPrompt(messages),
          },
        }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        },
        method: 'POST',
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Replicate request failed (${String(response.status)}): ${
          responseText || response.statusText
        }`,
      );
    }

    const payload = JSON.parse(responseText) as ProviderOutputPayload;
    return this.resolveReplicatePrediction(config, payload);
  }

  private async resolveReplicatePrediction(
    config: IDesktopGenerationProviderConfig,
    payload: ProviderOutputPayload,
  ): Promise<string> {
    let current = payload;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = typeof current.status === 'string' ? current.status : '';

      if (current.error || isReplicateFailedStatus(status)) {
        throw new Error(
          `Replicate generation failed: ${String(current.error ?? current.detail ?? 'unknown error')}`,
        );
      }

      if (!status || isReplicateSucceededStatus(status)) {
        return extractProviderOutputText(current);
      }

      if (!isReplicatePendingStatus(status)) {
        return extractProviderOutputText(current);
      }

      const statusUrl =
        typeof current.urls?.get === 'string'
          ? current.urls.get
          : typeof current.id === 'string'
            ? `${config.baseUrl}/predictions/${encodeURIComponent(current.id)}`
            : undefined;

      if (!statusUrl) {
        throw new Error(
          `Replicate generation is ${status} but did not return a status URL.`,
        );
      }

      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });
      const statusText = await statusResponse.text();
      if (!statusResponse.ok) {
        throw new Error(
          `Replicate status request failed (${String(statusResponse.status)}): ${
            statusText || statusResponse.statusText
          }`,
        );
      }

      current = JSON.parse(statusText) as ProviderOutputPayload;
    }

    throw new Error(
      'Replicate generation timed out waiting for the prediction result.',
    );
  }

  private async requestFalCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: Array<{ content: string; role: 'system' | 'user' }>,
  ): Promise<string> {
    if (!config.apiKey) {
      throw new Error('fal provider requires an API key.');
    }

    const createResponse = await fetch(`${config.baseUrl}/${config.model}`, {
      body: JSON.stringify({
        prompt: this.buildProviderPrompt(messages),
      }),
      headers: {
        Authorization: `Key ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    const createText = await createResponse.text();
    if (!createResponse.ok) {
      throw new Error(
        `fal request failed (${String(createResponse.status)}): ${
          createText || createResponse.statusText
        }`,
      );
    }

    const created = JSON.parse(createText) as ProviderOutputPayload;
    const requestId =
      typeof created.request_id === 'string' ? created.request_id : undefined;

    if (!requestId) {
      return extractProviderOutputText(created);
    }

    const statusUrl =
      typeof created.status_url === 'string'
        ? created.status_url
        : `${config.baseUrl}/${config.model}/requests/${requestId}/status`;
    const resultUrl =
      typeof created.response_url === 'string'
        ? created.response_url
        : `${config.baseUrl}/${config.model}/requests/${requestId}`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Key ${config.apiKey}`,
        },
      });
      const statusText = await statusResponse.text();
      if (!statusResponse.ok) {
        throw new Error(
          `fal status request failed (${String(statusResponse.status)}): ${
            statusText || statusResponse.statusText
          }`,
        );
      }

      const statusPayload = JSON.parse(statusText) as ProviderOutputPayload;
      const status =
        typeof statusPayload.status === 'string'
          ? statusPayload.status.toUpperCase()
          : '';

      if (status === 'COMPLETED') {
        const resultResponse = await fetch(resultUrl, {
          headers: {
            Authorization: `Key ${config.apiKey}`,
          },
        });
        const resultText = await resultResponse.text();
        if (!resultResponse.ok) {
          throw new Error(
            `fal result request failed (${String(resultResponse.status)}): ${
              resultText || resultResponse.statusText
            }`,
          );
        }

        return extractProviderOutputText(
          JSON.parse(resultText) as ProviderOutputPayload,
        );
      }

      if (status === 'FAILED' || statusPayload.error) {
        throw new Error(
          `fal generation failed: ${String(statusPayload.error ?? statusPayload.detail ?? 'unknown error')}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('fal generation timed out waiting for the queued result.');
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
  extractProviderOutputText,
  buildUserPrompt,
  extractCompletionText,
  normalizeProviderConfig,
};
