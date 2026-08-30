import type {
  IDesktopAssetGenerationRequest,
  IDesktopContentRunBrief,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
  IDesktopGenerationProviderPublicConfig,
  IDesktopGenerationProviderTestResult,
} from '@genfeedai/desktop-contracts';
import { sleep } from '@genfeedai/helpers';
import type { DesktopConfigService } from './config.service';

const PROVIDER_CONFIG_KEY = 'desktop.generation.provider';
const MAX_GENERATED_ASSET_BYTES = 50 * 1024 * 1024;
const LOCAL_PROVIDER_TIMEOUT_ERROR =
  'The local provider did not respond. Start Ollama or LM Studio, or pick a reachable endpoint.';

async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(LOCAL_PROVIDER_TIMEOUT_ERROR);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

type GenerationMessage = {
  content: string;
  role: 'system' | 'user';
};

export interface DesktopGenerationProviderStore {
  deleteValue: (key: string) => Promise<void>;
  getValue: (key: string) => Promise<string | null>;
  setValue: (key: string, value: string) => Promise<void>;
}

export interface ProviderGeneratedAsset {
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
  mimeType: string;
  model: string;
  originalUrl?: string;
  provider: 'fal' | 'replicate';
}

const isReplicatePendingStatus = (status: string): boolean =>
  ['queued', 'processing', 'starting'].includes(status.toLowerCase());

const isReplicateSucceededStatus = (status: string): boolean =>
  status.toLowerCase() === 'succeeded';

const isReplicateFailedStatus = (status: string): boolean =>
  ['canceled', 'cancelled', 'failed'].includes(status.toLowerCase());

export const providerDisplayName = (
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

export const buildSystemPrompt = (): string =>
  [
    'You are Genfeed Desktop, an offline-first content generation assistant.',
    'Generate practical, ready-to-edit content for a creator workflow.',
    'Do not mention that you are a local model or that you lack cloud access.',
  ].join(' ');

const formatBriefForPrompt = (brief: IDesktopContentRunBrief): string =>
  [
    brief.angle ? `Brief angle: ${brief.angle}` : undefined,
    brief.audience ? `Audience: ${brief.audience}` : undefined,
    brief.channelFit ? `Channel fit: ${brief.channelFit}` : undefined,
    brief.hypothesis ? `Hypothesis: ${brief.hypothesis}` : undefined,
    brief.callToAction ? `Call to action: ${brief.callToAction}` : undefined,
    brief.risk ? `Guardrail: ${brief.risk}` : undefined,
    brief.evidence?.length
      ? `Evidence: ${brief.evidence.join(' | ')}`
      : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');

export const buildUserPrompt = (params: IDesktopGenerationOptions): string => {
  const source = params.brief
    ? formatBriefForPrompt(params.brief)
    : params.sourceTrendTopic
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

const getProviderJson = async <T>(
  response: Response,
  errorLabel = 'Provider request failed',
): Promise<T> => {
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `${errorLabel} (${String(response.status)}): ${
        responseText || response.statusText
      }`,
    );
  }

  return JSON.parse(responseText) as T;
};

const extractFirstImageUrl = (payload: unknown): string => {
  const urls: string[] = [];

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) {
        urls.push(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['url', 'image_url', 'file_url']) {
      visit(record[key]);
    }
    for (const key of ['images', 'output', 'files', 'artifacts']) {
      visit(record[key]);
    }
  };

  visit(payload);

  const imageUrl = urls.find((url) =>
    /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(url),
  );

  if (imageUrl) {
    return imageUrl;
  }

  if (urls[0]) {
    return urls[0];
  }

  throw new Error('Provider response did not include a generated image URL.');
};

const downloadGeneratedImage = async (
  url: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> => {
  const response = await fetch(url);
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';

  if (!response.ok) {
    throw new Error(
      `Generated image download failed (${String(response.status)}): ${
        response.statusText || url
      }`,
    );
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error(
      `Generated asset download returned ${mimeType || 'an unknown content type'} instead of an image.`,
    );
  }

  const contentLength = response.headers.get('content-length');
  if (
    contentLength &&
    Number.parseInt(contentLength, 10) > MAX_GENERATED_ASSET_BYTES
  ) {
    throw new Error('Generated image is larger than the desktop size limit.');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_GENERATED_ASSET_BYTES) {
    throw new Error('Generated image is larger than the desktop size limit.');
  }

  return {
    bytes,
    mimeType,
  };
};

const buildProviderHeaders = (
  config: IDesktopGenerationProviderConfig,
): Record<string, string> => ({
  ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  'Content-Type': 'application/json',
});

export class DesktopGenerationProviderService {
  constructor(
    private readonly database: DesktopGenerationProviderStore,
    private readonly configService: Pick<
      DesktopConfigService,
      'getLocalProviderTimeoutMs'
    >,
  ) {}

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

  async requireProviderConfig(): Promise<IDesktopGenerationProviderConfig> {
    const config = await this.getProviderConfig();
    if (!config) {
      throw new Error(
        'Configure a local generation provider before generating content.',
      );
    }

    return config;
  }

  async requestCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: GenerationMessage[],
  ): Promise<string> {
    if (config.provider === 'replicate') {
      return this.requestReplicateCompletion(config, messages);
    }

    if (config.provider === 'fal') {
      return this.requestFalCompletion(config, messages);
    }

    const { response, text: responseText } = await fetchTextWithTimeout(
      buildCompletionUrl(config.baseUrl),
      this.configService.getLocalProviderTimeoutMs(),
      {
        body: JSON.stringify({
          messages,
          model: config.model,
          temperature: 0.7,
        }),
        headers: buildProviderHeaders(config),
        method: 'POST',
      },
    );

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

  async requestAssetGeneration(
    config: IDesktopGenerationProviderConfig,
    request: IDesktopAssetGenerationRequest,
  ): Promise<ProviderGeneratedAsset> {
    if (request.provider === 'replicate') {
      return this.requestReplicateAssetGeneration(config, request);
    }

    return this.requestFalAssetGeneration(config, request);
  }

  private buildProviderPrompt(messages: GenerationMessage[]): string {
    return messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n');
  }

  private buildAssetProviderInput(
    request: IDesktopAssetGenerationRequest,
  ): Record<string, unknown> {
    return {
      ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.height ? { height: request.height } : {}),
      ...(request.negativePrompt
        ? { negative_prompt: request.negativePrompt }
        : {}),
      ...(typeof request.seed === 'number' ? { seed: request.seed } : {}),
      ...(request.width ? { width: request.width } : {}),
      prompt: request.prompt,
    };
  }

  private async requestReplicateCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: GenerationMessage[],
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

    const payload = await getProviderJson<ProviderOutputPayload>(
      response,
      'Replicate request failed',
    );
    return this.resolveReplicatePrediction(config, payload);
  }

  private async requestReplicateAssetGeneration(
    config: IDesktopGenerationProviderConfig,
    request: IDesktopAssetGenerationRequest,
  ): Promise<ProviderGeneratedAsset> {
    if (!config.apiKey) {
      throw new Error('Replicate provider requires an API key.');
    }

    const [owner, modelName] = request.model.split('/');
    if (!owner || !modelName) {
      throw new Error('Replicate model must use owner/model format.');
    }

    const response = await fetch(
      `${config.baseUrl}/models/${encodeURIComponent(owner)}/${encodeURIComponent(modelName)}/predictions`,
      {
        body: JSON.stringify({
          input: this.buildAssetProviderInput(request),
        }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        },
        method: 'POST',
      },
    );

    const payload = await getProviderJson<ProviderOutputPayload>(response);
    const resolved = await this.resolveReplicateAssetPrediction(
      config,
      payload,
    );
    const imageUrl = extractFirstImageUrl(resolved.output ?? resolved);
    const downloaded = await downloadGeneratedImage(imageUrl);

    return {
      bytes: downloaded.bytes,
      metadata: {
        predictionId: resolved.id,
        providerStatus: resolved.status,
      },
      mimeType: downloaded.mimeType,
      model: request.model,
      originalUrl: imageUrl,
      provider: 'replicate',
    };
  }

  private async resolveReplicateAssetPrediction(
    config: IDesktopGenerationProviderConfig,
    payload: ProviderOutputPayload,
  ): Promise<ProviderOutputPayload> {
    let current = payload;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = typeof current.status === 'string' ? current.status : '';

      if (current.error || isReplicateFailedStatus(status)) {
        throw new Error(
          `Replicate generation failed: ${String(current.error ?? current.detail ?? 'unknown error')}`,
        );
      }

      if (!status || isReplicateSucceededStatus(status)) {
        return current;
      }

      if (!isReplicatePendingStatus(status)) {
        return current;
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
        await sleep(1000);
      }

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });
      current = await getProviderJson<ProviderOutputPayload>(statusResponse);
    }

    throw new Error(
      'Replicate generation timed out waiting for the prediction result.',
    );
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
        await sleep(1000);
      }

      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });
      current = await getProviderJson<ProviderOutputPayload>(
        statusResponse,
        'Replicate status request failed',
      );
    }

    throw new Error(
      'Replicate generation timed out waiting for the prediction result.',
    );
  }

  private async requestFalCompletion(
    config: IDesktopGenerationProviderConfig,
    messages: GenerationMessage[],
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

    const created = await getProviderJson<ProviderOutputPayload>(
      createResponse,
      'fal request failed',
    );
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
      const statusPayload = await getProviderJson<ProviderOutputPayload>(
        statusResponse,
        'fal status request failed',
      );
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
        return extractProviderOutputText(
          await getProviderJson<ProviderOutputPayload>(
            resultResponse,
            'fal result request failed',
          ),
        );
      }

      if (status === 'FAILED' || statusPayload.error) {
        throw new Error(
          `fal generation failed: ${String(statusPayload.error ?? statusPayload.detail ?? 'unknown error')}`,
        );
      }

      await sleep(1000);
    }

    throw new Error('fal generation timed out waiting for the queued result.');
  }

  private async requestFalAssetGeneration(
    config: IDesktopGenerationProviderConfig,
    request: IDesktopAssetGenerationRequest,
  ): Promise<ProviderGeneratedAsset> {
    if (!config.apiKey) {
      throw new Error('fal provider requires an API key.');
    }

    const createResponse = await fetch(`${config.baseUrl}/${request.model}`, {
      body: JSON.stringify(this.buildAssetProviderInput(request)),
      headers: {
        Authorization: `Key ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const created =
      await getProviderJson<ProviderOutputPayload>(createResponse);
    const resolved = await this.resolveFalAssetResult(config, request, created);
    const imageUrl = extractFirstImageUrl(resolved.output ?? resolved);
    const downloaded = await downloadGeneratedImage(imageUrl);

    return {
      bytes: downloaded.bytes,
      metadata: {
        providerStatus: resolved.status,
        requestId: resolved.request_id ?? created.request_id,
      },
      mimeType: downloaded.mimeType,
      model: request.model,
      originalUrl: imageUrl,
      provider: 'fal',
    };
  }

  private async resolveFalAssetResult(
    config: IDesktopGenerationProviderConfig,
    request: IDesktopAssetGenerationRequest,
    created: ProviderOutputPayload,
  ): Promise<ProviderOutputPayload> {
    const requestId =
      typeof created.request_id === 'string' ? created.request_id : undefined;

    if (!requestId) {
      return created;
    }

    const statusUrl =
      typeof created.status_url === 'string'
        ? created.status_url
        : `${config.baseUrl}/${request.model}/requests/${requestId}/status`;
    const resultUrl =
      typeof created.response_url === 'string'
        ? created.response_url
        : `${config.baseUrl}/${request.model}/requests/${requestId}`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const statusResponse = await fetch(statusUrl, {
        headers: {
          Authorization: `Key ${config.apiKey}`,
        },
      });
      const statusPayload =
        await getProviderJson<ProviderOutputPayload>(statusResponse);
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

        return getProviderJson<ProviderOutputPayload>(resultResponse);
      }

      if (status === 'FAILED' || statusPayload.error) {
        throw new Error(
          `fal generation failed: ${String(statusPayload.error ?? statusPayload.detail ?? 'unknown error')}`,
        );
      }

      await sleep(1000);
    }

    throw new Error('fal generation timed out waiting for the queued result.');
  }
}

export const __desktopGenerationProviderServiceTestUtils = {
  buildCompletionUrl,
  buildUserPrompt,
  downloadGeneratedImage,
  extractCompletionText,
  extractFirstImageUrl,
  extractProviderOutputText,
  normalizeProviderConfig,
};
