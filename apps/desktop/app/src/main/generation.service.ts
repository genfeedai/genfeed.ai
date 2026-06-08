import { randomUUID } from 'node:crypto';
import type {
  IDesktopAsset,
  IDesktopAssetGenerationRequest,
  IDesktopContentRunBrief,
  IDesktopGenerationJob,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
  IDesktopGenerationProviderPublicConfig,
  IDesktopGenerationProviderTestResult,
  IDesktopWorkflowGenerationOptions,
  IDesktopWorkflowGenerationResult,
} from '@genfeedai/desktop-contracts';
import { sleep } from '@genfeedai/helpers';
import {
  buildWorkflowGenerationMessages,
  DEFAULT_WORKFLOW_GENERATION_NODE_TYPES,
  parseWorkflowGenerationResponse,
} from '@genfeedai/workflows';
import { toIso } from './time.util';

export interface GenerationSyncJobRow {
  createdAt: string;
  error: string | null;
  id: string;
  payload: string;
  retryCount: number;
  status: string;
  type: string;
  updatedAt: string;
  workspaceId: string | null;
}

export interface DesktopGenerationStore {
  deleteValue: (key: string) => Promise<void>;
  getValue: (key: string) => Promise<string | null>;
  getSyncJob?: (jobId: string) => Promise<GenerationSyncJobRow | null>;
  listSyncJobs?: (
    type: string,
    workspaceId?: string,
  ) => Promise<GenerationSyncJobRow[]>;
  setValue: (key: string, value: string) => Promise<void>;
  upsertSyncJob: (row: GenerationSyncJobRow) => Promise<void>;
}

const PROVIDER_CONFIG_KEY = 'desktop.generation.provider';
const GENERATION_JOB_TYPE = 'generation';
const ASSET_GENERATION_JOB_TYPE = 'asset-generation';
const MAX_GENERATED_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_ASSET_JOB_RETRIES = 2;

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

export interface ProviderGeneratedAsset {
  bytes: Uint8Array;
  metadata: Record<string, unknown>;
  mimeType: string;
  model: string;
  originalUrl?: string;
  provider: 'fal' | 'replicate';
}

export interface DesktopGeneratedAssetWriter {
  writeGeneratedAsset: (options: {
    bytes: Uint8Array;
    displayName?: string;
    jobId: string;
    mimeType: string;
    model: string;
    provider: string;
    uploadPolicy?: IDesktopAssetGenerationRequest['uploadPolicy'];
    workspaceId: string;
  }) => Promise<IDesktopAsset>;
}

type AssetGenerationJobPayload = {
  assetIds: string[];
  kind: 'asset-generation';
  providerMetadata?: Record<string, unknown>;
  request: IDesktopAssetGenerationRequest;
};

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

const buildUserPrompt = (params: IDesktopGenerationOptions): string => {
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

const buildGenerationPayload = (params: IDesktopGenerationOptions): string =>
  JSON.stringify({
    platform: params.platform,
    projectId: params.projectId,
    brief: params.brief,
    prompt: params.prompt,
    publishIntent: params.publishIntent,
    sourceDraftId: params.sourceDraftId,
    sourceTrendId: params.sourceTrendId,
    sourceTrendTopic: params.sourceTrendTopic,
    type: params.type,
  });

const buildAssetGenerationPayload = (
  request: IDesktopAssetGenerationRequest,
  assetIds: string[] = [],
  providerMetadata?: Record<string, unknown>,
): string =>
  JSON.stringify({
    assetIds,
    kind: ASSET_GENERATION_JOB_TYPE,
    providerMetadata,
    request: {
      ...request,
      kind: 'image',
      uploadPolicy: request.uploadPolicy ?? 'never',
    },
  } satisfies AssetGenerationJobPayload);

const parseAssetGenerationPayload = (
  payload: string,
): AssetGenerationJobPayload | null => {
  try {
    const parsed = JSON.parse(payload) as Partial<AssetGenerationJobPayload>;
    const request = parsed.request as
      | Partial<IDesktopAssetGenerationRequest>
      | undefined;

    if (
      parsed.kind !== ASSET_GENERATION_JOB_TYPE ||
      !request?.workspaceId ||
      !request.model ||
      !request.prompt ||
      (request.provider !== 'replicate' && request.provider !== 'fal')
    ) {
      return null;
    }

    return {
      assetIds: Array.isArray(parsed.assetIds)
        ? parsed.assetIds.filter(
            (assetId): assetId is string => typeof assetId === 'string',
          )
        : [],
      kind: ASSET_GENERATION_JOB_TYPE,
      providerMetadata:
        parsed.providerMetadata && typeof parsed.providerMetadata === 'object'
          ? (parsed.providerMetadata as Record<string, unknown>)
          : undefined,
      request: {
        aspectRatio:
          typeof request.aspectRatio === 'string'
            ? request.aspectRatio
            : undefined,
        height:
          typeof request.height === 'number' && Number.isFinite(request.height)
            ? request.height
            : undefined,
        inputAssetIds: Array.isArray(request.inputAssetIds)
          ? request.inputAssetIds.filter(
              (assetId): assetId is string => typeof assetId === 'string',
            )
          : undefined,
        kind: 'image',
        model: request.model,
        negativePrompt:
          typeof request.negativePrompt === 'string'
            ? request.negativePrompt
            : undefined,
        prompt: request.prompt,
        provider: request.provider,
        seed:
          typeof request.seed === 'number' && Number.isFinite(request.seed)
            ? request.seed
            : undefined,
        uploadPolicy:
          request.uploadPolicy === 'full' ||
          request.uploadPolicy === 'metadata-only'
            ? request.uploadPolicy
            : 'never',
        width:
          typeof request.width === 'number' && Number.isFinite(request.width)
            ? request.width
            : undefined,
        workspaceId: request.workspaceId,
      },
    };
  } catch {
    return null;
  }
};

const toGenerationJob = (
  row: GenerationSyncJobRow,
): IDesktopGenerationJob | null => {
  const payload = parseAssetGenerationPayload(row.payload);
  if (!payload) {
    return null;
  }

  const status =
    row.status === 'pending'
      ? 'queued'
      : row.status === 'completed'
        ? 'succeeded'
        : row.status;

  if (
    status !== 'queued' &&
    status !== 'running' &&
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'cancelled'
  ) {
    return null;
  }

  return {
    assetIds: payload.assetIds,
    createdAt: row.createdAt,
    error: row.error ?? undefined,
    id: row.id,
    kind: ASSET_GENERATION_JOB_TYPE,
    model: payload.request.model,
    provider: payload.request.provider,
    status,
    updatedAt: row.updatedAt,
    workspaceId: payload.request.workspaceId,
  };
};

const sanitizeProviderError = (
  error: unknown,
  config?: IDesktopGenerationProviderConfig,
): string => {
  const message =
    error instanceof Error ? error.message : 'Asset generation failed.';

  return config?.apiKey
    ? message.replaceAll(config.apiKey, '[redacted]')
    : message;
};

const getProviderJson = async <T>(response: Response): Promise<T> => {
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Provider request failed (${String(response.status)}): ${
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

export class DesktopGenerationService {
  private isProcessingAssetQueue = false;

  constructor(
    private readonly database: DesktopGenerationStore,
    private readonly generatedAssetWriter?: DesktopGeneratedAssetWriter,
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

  async resumeAssetGenerationJobs(): Promise<void> {
    const rows =
      (await this.database.listSyncJobs?.(ASSET_GENERATION_JOB_TYPE)) ?? [];
    const now = toIso();

    for (const row of rows) {
      if (row.status !== 'running') {
        continue;
      }

      await this.database.upsertSyncJob({
        ...row,
        error: 'Desktop restarted before this asset generation finished.',
        status: 'queued',
        updatedAt: now,
      });
    }

    void this.processAssetQueue();
  }

  async enqueueAssetGeneration(
    request: IDesktopAssetGenerationRequest,
  ): Promise<IDesktopGenerationJob> {
    if (!this.generatedAssetWriter) {
      throw new Error('Desktop asset generation is not configured.');
    }

    const normalizedRequest = this.normalizeAssetGenerationRequest(request);
    const now = toIso();
    const row: GenerationSyncJobRow = {
      createdAt: now,
      error: null,
      id: randomUUID(),
      payload: buildAssetGenerationPayload(normalizedRequest),
      retryCount: 0,
      status: 'queued',
      type: ASSET_GENERATION_JOB_TYPE,
      updatedAt: now,
      workspaceId: normalizedRequest.workspaceId,
    };

    await this.database.upsertSyncJob(row);
    void this.processAssetQueue();

    const job = toGenerationJob(row);
    if (!job) {
      throw new Error('Failed to create local asset generation job.');
    }

    return job;
  }

  async getGenerationJob(jobId: string): Promise<IDesktopGenerationJob | null> {
    const row = await this.database.getSyncJob?.(jobId);
    return row ? toGenerationJob(row) : null;
  }

  async listGenerationJobs(
    workspaceId?: string,
  ): Promise<IDesktopGenerationJob[]> {
    const rows =
      (await this.database.listSyncJobs?.(
        ASSET_GENERATION_JOB_TYPE,
        workspaceId,
      )) ?? [];

    return rows
      .map(toGenerationJob)
      .filter((job): job is IDesktopGenerationJob => Boolean(job));
  }

  async cancelGenerationJob(jobId: string): Promise<IDesktopGenerationJob> {
    const row = await this.database.getSyncJob?.(jobId);
    const job = row ? toGenerationJob(row) : null;
    if (!row || !job) {
      throw new Error('Asset generation job was not found.');
    }

    if (job.status === 'succeeded' || job.status === 'failed') {
      return job;
    }

    const updatedRow = {
      ...row,
      error: null,
      status: 'cancelled',
      updatedAt: toIso(),
    };
    await this.database.upsertSyncJob(updatedRow);

    const updatedJob = toGenerationJob(updatedRow);
    if (!updatedJob) {
      throw new Error('Failed to cancel asset generation job.');
    }

    return updatedJob;
  }

  private async createGenerationJob(
    params: IDesktopGenerationOptions,
  ): Promise<GenerationSyncJobRow> {
    const now = toIso();
    const row: GenerationSyncJobRow = {
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

  private normalizeAssetGenerationRequest(
    request: IDesktopAssetGenerationRequest,
  ): IDesktopAssetGenerationRequest {
    const prompt = request.prompt.trim();
    const model = request.model.trim();
    const workspaceId = request.workspaceId.trim();

    if (!workspaceId) {
      throw new Error('Workspace is required for asset generation.');
    }

    if (!prompt) {
      throw new Error('Prompt is required for asset generation.');
    }

    if (!model) {
      throw new Error('Model is required for asset generation.');
    }

    if (request.provider !== 'replicate' && request.provider !== 'fal') {
      throw new Error(
        'Desktop asset generation currently supports Replicate and fal.ai.',
      );
    }

    return {
      aspectRatio: request.aspectRatio?.trim() || undefined,
      height: request.height,
      inputAssetIds: request.inputAssetIds,
      kind: 'image',
      model,
      negativePrompt: request.negativePrompt?.trim() || undefined,
      prompt,
      provider: request.provider,
      seed: request.seed,
      uploadPolicy: request.uploadPolicy ?? 'never',
      width: request.width,
      workspaceId,
    };
  }

  private async processAssetQueue(): Promise<void> {
    if (this.isProcessingAssetQueue || !this.generatedAssetWriter) {
      return;
    }

    this.isProcessingAssetQueue = true;

    try {
      while (true) {
        const rows =
          (await this.database.listSyncJobs?.(ASSET_GENERATION_JOB_TYPE)) ?? [];
        const nextRow = rows
          .filter((row) => row.status === 'queued')
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .at(0);

        if (!nextRow) {
          return;
        }

        await this.runAssetGenerationJob(nextRow);
      }
    } finally {
      this.isProcessingAssetQueue = false;
    }
  }

  private async runAssetGenerationJob(
    row: GenerationSyncJobRow,
  ): Promise<void> {
    const payload = parseAssetGenerationPayload(row.payload);
    if (!payload || !this.generatedAssetWriter) {
      return;
    }

    const startedRow = {
      ...row,
      error: null,
      status: 'running',
      updatedAt: toIso(),
    };
    await this.database.upsertSyncJob(startedRow);

    let config: IDesktopGenerationProviderConfig | undefined;

    try {
      config = await this.requireProviderConfig();
      if (config.provider !== payload.request.provider) {
        throw new Error(
          `Configured provider is ${providerDisplayName(config)}, but this job requires ${payload.request.provider}.`,
        );
      }

      const generatedAsset = await this.requestAssetGeneration(
        config,
        payload.request,
      );
      const asset = await this.generatedAssetWriter.writeGeneratedAsset({
        bytes: generatedAsset.bytes,
        displayName: `${payload.request.provider} ${payload.request.model}`,
        jobId: row.id,
        mimeType: generatedAsset.mimeType,
        model: payload.request.model,
        provider: payload.request.provider,
        uploadPolicy: payload.request.uploadPolicy ?? 'never',
        workspaceId: payload.request.workspaceId,
      });

      await this.database.upsertSyncJob({
        ...startedRow,
        payload: buildAssetGenerationPayload(payload.request, [asset.id], {
          ...generatedAsset.metadata,
          mimeType: generatedAsset.mimeType,
          originalUrl: generatedAsset.originalUrl,
        }),
        status: 'succeeded',
        updatedAt: toIso(),
      });
    } catch (error) {
      const errorMessage = sanitizeProviderError(error, config);
      const shouldRetry = row.retryCount < MAX_ASSET_JOB_RETRIES;

      await this.database.upsertSyncJob({
        ...startedRow,
        error: errorMessage,
        retryCount: row.retryCount + 1,
        status: shouldRetry ? 'queued' : 'failed',
        updatedAt: toIso(),
      });

      if (shouldRetry) {
        await sleep(250);
      }
    }
  }

  private async requestAssetGeneration(
    config: IDesktopGenerationProviderConfig,
    request: IDesktopAssetGenerationRequest,
  ): Promise<ProviderGeneratedAsset> {
    if (request.provider === 'replicate') {
      return this.requestReplicateAssetGeneration(config, request);
    }

    return this.requestFalAssetGeneration(config, request);
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
    job: GenerationSyncJobRow,
    status: GenerationSyncJobRow['status'],
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
  downloadGeneratedImage,
  extractFirstImageUrl,
  extractProviderOutputText,
  buildUserPrompt,
  extractCompletionText,
  normalizeProviderConfig,
  parseAssetGenerationPayload,
};
