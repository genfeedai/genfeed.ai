import { randomUUID } from 'node:crypto';
import type {
  IDesktopAsset,
  IDesktopAssetGenerationRequest,
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
  buildWorkflowGenerationNodeTypes,
  parseWorkflowGenerationResponse,
} from '@genfeedai/workflows/generation';
import type { DesktopConfigService } from './config.service';
import {
  __desktopGenerationProviderServiceTestUtils,
  buildSystemPrompt,
  buildUserPrompt,
  DesktopGenerationProviderService,
  providerDisplayName,
} from './generation-provider.service';
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

const GENERATION_JOB_TYPE = 'generation';
const ASSET_GENERATION_JOB_TYPE = 'asset-generation';
const MAX_ASSET_JOB_RETRIES = 2;

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

export class DesktopGenerationService {
  private isProcessingAssetQueue = false;
  private readonly providerService: DesktopGenerationProviderService;

  constructor(
    private readonly database: DesktopGenerationStore,
    configService: Pick<DesktopConfigService, 'getLocalProviderTimeoutMs'>,
    private readonly generatedAssetWriter?: DesktopGeneratedAssetWriter,
  ) {
    this.providerService = new DesktopGenerationProviderService(
      database,
      configService,
    );
  }

  async clearProviderConfig(): Promise<void> {
    await this.providerService.clearProviderConfig();
  }

  async getProviderConfig(): Promise<IDesktopGenerationProviderConfig | null> {
    return this.providerService.getProviderConfig();
  }

  async getPublicProviderConfig(): Promise<IDesktopGenerationProviderPublicConfig | null> {
    return this.providerService.getPublicProviderConfig();
  }

  async saveProviderConfig(
    config: IDesktopGenerationProviderConfig,
  ): Promise<IDesktopGenerationProviderPublicConfig> {
    return this.providerService.saveProviderConfig(config);
  }

  async testProviderConfig(
    config?: IDesktopGenerationProviderConfig,
  ): Promise<IDesktopGenerationProviderTestResult> {
    return this.providerService.testProviderConfig(config);
  }

  async generateContent(params: IDesktopGenerationOptions): Promise<string> {
    const config = await this.providerService.requireProviderConfig();
    const job = await this.createGenerationJob(params);

    try {
      const content = await this.providerService.requestCompletion(config, [
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
    const config = await this.providerService.requireProviderConfig();
    const messages = buildWorkflowGenerationMessages({
      availableNodeTypes: buildWorkflowGenerationNodeTypes(),
      description: params.description,
      targetPlatforms: params.targetPlatforms,
    });
    const raw = await this.providerService.requestCompletion(config, messages);

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
      config = await this.providerService.requireProviderConfig();
      if (config.provider !== payload.request.provider) {
        throw new Error(
          `Configured provider is ${providerDisplayName(config)}, but this job requires ${payload.request.provider}.`,
        );
      }

      const generatedAsset = await this.providerService.requestAssetGeneration(
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
  ...__desktopGenerationProviderServiceTestUtils,
  parseAssetGenerationPayload,
};
