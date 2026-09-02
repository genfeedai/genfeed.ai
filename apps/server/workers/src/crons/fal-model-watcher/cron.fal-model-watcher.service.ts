import { ModelsService } from '@api/collections/models/services/models.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';
import type {
  IFalModel,
  IModelDiscoveryInput,
  IModelDiscoveryRunSummary,
} from '@workers/interfaces/model-discovery.interface';
import {
  FalModelContractSyncService,
  type FalSyncModelRecord,
} from '@workers/services/fal-model-contract-sync.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

/** Lifecycle status fal reports for endpoints that still accept requests */
const FAL_MODEL_STATUS_ACTIVE = 'active';

/**
 * fal publishes a task-shaped category (`text-to-image`) where the registry
 * stores an output-shaped one. Anything unmapped falls through to the shared
 * description-based detection.
 */
const FAL_CATEGORY_MAP: Record<string, ModelCategory> = {
  'audio-to-text': ModelCategory.VOICE,
  'image-to-image': ModelCategory.IMAGE_EDIT,
  'image-to-video': ModelCategory.VIDEO,
  llm: ModelCategory.TEXT,
  'speech-to-text': ModelCategory.VOICE,
  'text-to-audio': ModelCategory.MUSIC,
  'text-to-image': ModelCategory.IMAGE,
  'text-to-speech': ModelCategory.VOICE,
  'text-to-video': ModelCategory.VIDEO,
  'video-to-video': ModelCategory.VIDEO_EDIT,
  vision: ModelCategory.TEXT,
};

@Injectable()
export class CronFalModelWatcherService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelDiscoveryService: ModelDiscoveryService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly falPlatformClient: FalPlatformClient,
    private readonly falContractSyncService: FalModelContractSyncService,
  ) {}

  /**
   * Weekly fal model discovery cron.
   * Polls the fal model search API, diffs against the `Model` registry, and
   * creates draft rows for anything new. Drafts stay `isActive: false` until an
   * operator approves them — this cron never activates a model.
   *
   * Runs weekly on Sunday at 7 AM UTC, an hour after the Replicate watcher so
   * the two providers never contend for the same registry rows.
   */
  async discoverNewModels(): Promise<IModelDiscoveryRunSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const summary: IModelDiscoveryRunSummary = {
      draftsCreated: 0,
      errors: 0,
      newModelsFound: 0,
      providerContractsDrifted: 0,
      providerContractsQuarantined: 0,
      providerContractsSynchronized: 0,
      timestamp: new Date(),
      totalPolled: 0,
    };

    if (!this.configService.get('FAL_API_KEY')) {
      this.logger.warn(`${url} FAL_API_KEY not configured, skipping sync`);
      return summary;
    }

    try {
      // Step 1: Fetch all known provider identities from the registry. The diff
      // only needs provider + endpoint, so read them straight off the delegate
      // instead of pulling every row's JSONB config through
      // `modelsService.find`.
      const registryRows = await this.modelsService.prisma.model.findMany({
        select: {
          endpoint: true,
          id: true,
          isActive: true,
          key: true,
          provider: true,
          reviewedProviderContractVersion: true,
        },
        where: { isDeleted: false, organizationId: null },
      });
      const existingFalModels = new Map<string, FalSyncModelRecord>(
        registryRows
          .filter((row) => row.provider === ModelProvider.FAL)
          .map((row) => [row.endpoint || row.key, row] as const),
      );

      this.logger.log(
        `${url} loaded ${existingFalModels.size} existing fal endpoints`,
      );

      // Step 2: Poll authenticated, OpenAPI-expanded Fal model search.
      const falModels = await this.falPlatformClient.fetchModels();
      summary.totalPolled = falModels.length;

      this.logger.log(`${url} polled ${falModels.length} models from fal`);

      // Step 3: Keep only routable, non-deprecated endpoints
      const routableModels = falModels.filter((model) =>
        this.isRoutableModel(model),
      );

      this.logger.log(`${url} ${routableModels.length} routable fal endpoints`);

      // Step 4: Fetch account-specific pricing for the exact endpoint set.
      const pricing = await this.falPlatformClient.fetchPricing(
        routableModels.map((model) => model.endpoint_id),
      );
      const pricingByEndpoint = new Map<
        string,
        Array<Record<string, unknown>>
      >();
      for (const price of pricing) {
        const endpoint = price.endpoint_id;
        if (typeof endpoint !== 'string') continue;
        const endpointPrices = pricingByEndpoint.get(endpoint) ?? [];
        endpointPrices.push(price);
        pricingByEndpoint.set(endpoint, endpointPrices);
      }

      // Step 5: Diff against the registry.
      const newModels = routableModels.filter(
        (model) => !existingFalModels.has(model.endpoint_id),
      );

      summary.newModelsFound = newModels.length;

      if (newModels.length === 0) {
        this.logger.log(`${url} no new fal models discovered`);
      }

      this.logger.log(
        `${url} found ${newModels.length} new models to process`,
        {
          models: newModels.map((model) => model.endpoint_id),
        },
      );

      // Step 6: Create missing drafts, then persist a versioned contract for
      // every endpoint. Candidate writes never replace reviewed runtime fields.
      for (const model of routableModels) {
        let registryModel = existingFalModels.get(model.endpoint_id);
        try {
          if (!registryModel) {
            const draft = await this.modelDiscoveryService.createDraftModel(
              this.buildDiscoveryInput(model),
            );

            if (!draft) continue;
            summary.draftsCreated++;
            registryModel = draft;
            await this.sendDiscoveryNotification(
              model.endpoint_id,
              this.detectModelCategory(model),
              draft.cost ?? 0,
            );
          }

          const syncResult = await this.falContractSyncService.synchronizeModel(
            registryModel,
            model,
            pricingByEndpoint.get(model.endpoint_id) ?? [],
            summary.timestamp,
          );
          summary.providerContractsSynchronized =
            (summary.providerContractsSynchronized ?? 0) + 1;
          if (syncResult.drifted) {
            summary.providerContractsDrifted =
              (summary.providerContractsDrifted ?? 0) + 1;
          }
          if (syncResult.quarantined) {
            summary.providerContractsQuarantined =
              (summary.providerContractsQuarantined ?? 0) + 1;
          }
        } catch (error: unknown) {
          summary.errors++;
          if (registryModel?.id) {
            await this.falContractSyncService.recordFailure(
              'contract_sync_failed',
              summary.timestamp,
              registryModel.id,
            );
          }
          this.logger.error(
            `${url} failed to process model ${model.endpoint_id}`,
            { reason: error instanceof Error ? error.name : 'unknown' },
          );
        }
      }

      // Step 7: Log low-cardinality observability only. Raw schemas, pricing,
      // account metadata, and credentials never enter logs.
      this.logger.log(`${url} completed`, {
        draftsCreated: summary.draftsCreated,
        errors: summary.errors,
        newModelsFound: summary.newModelsFound,
        providerContractsDrifted: summary.providerContractsDrifted,
        providerContractsQuarantined: summary.providerContractsQuarantined,
        providerContractsSynchronized: summary.providerContractsSynchronized,
        totalPolled: summary.totalPolled,
      });

      return summary;
    } catch (error: unknown) {
      summary.errors++;
      await this.falContractSyncService.recordFailure(
        'fal_sync_failed',
        summary.timestamp,
      );
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  /**
   * A fal endpoint is only worth drafting when generation can actually reach it.
   *
   * Provider-aware identity lets any active fal endpoint reach `FalService`,
   * including partner namespaces that overlap Replicate `owner/model` keys.
   * Discovery therefore filters only on upstream lifecycle state.
   */
  private isRoutableModel(model: IFalModel): boolean {
    const status = model.metadata?.status;

    return !status || status === FAL_MODEL_STATUS_ACTIVE;
  }

  /**
   * Build the shared discovery input from a Fal endpoint. The provider endpoint
   * stays verbatim while the discovery service derives a collision-safe public
   * key; `owner` is the first segment and `name` carries the remaining path.
   */
  private buildDiscoveryInput(model: IFalModel): IModelDiscoveryInput {
    const [owner, ...rest] = model.endpoint_id.split('/');
    const metadata = model.metadata;
    const displayName = metadata?.display_name?.trim();

    return {
      category: this.detectModelCategory(model),
      description: metadata?.description || '',
      endpoint: model.endpoint_id,
      name: rest.join('/'),
      owner: owner as string,
      provider: ModelProvider.FAL,
      providerUrl:
        metadata?.model_url || `https://fal.ai/models/${model.endpoint_id}`,
      versionId: null,
      ...(displayName ? { label: displayName } : {}),
    };
  }

  /**
   * Map the fal task category onto a registry category, falling back to the
   * shared description-based detection when fal publishes something unmapped.
   */
  private detectModelCategory(model: IFalModel): ModelCategory {
    const category = model.metadata?.category?.toLowerCase();
    const mapped = category ? FAL_CATEGORY_MAP[category] : undefined;

    if (mapped) {
      return mapped;
    }

    return this.modelDiscoveryService.detectCategory(
      {},
      `${category ?? ''} ${model.metadata?.description ?? ''}`,
    );
  }

  /**
   * Send a Discord notification for a newly discovered model.
   * Silently swallows errors to avoid failing the watcher.
   */
  private async sendDiscoveryNotification(
    modelKey: string,
    category: string,
    estimatedCost: number,
  ): Promise<void> {
    try {
      await this.notificationsService.sendModelDiscoveryNotification({
        category,
        estimatedCost,
        modelKey,
        provider: ModelProvider.FAL,
        // Commercial pricing remains in the private provider-contract table.
        providerCostUsd: 0,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} notification failed for ${modelKey}`,
        { error },
      );
    }
  }
}
