import { ModelsService } from '@api/collections/models/services/models.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  IModelDiscoveryInput,
  IModelDiscoveryRunSummary,
  IReplicateModel,
  IReplicateModelsResponse,
} from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import {
  ReplicateModelContractSyncService,
  type ReplicateSyncModelRecord,
} from '@workers/services/replicate-model-contract-sync.service';

/**
 * Verified model owners on Replicate whose models are considered
 * for auto-discovery. Community/user models are excluded.
 */
const VERIFIED_OWNERS: ReadonlySet<string> = new Set([
  'black-forest-labs',
  'bytedance',
  'google',
  'ideogram-ai',
  'kwaivgi',
  'luma',
  'meta',
  'minimax',
  'openai',
  'pixverse',
  'prunaai',
  'qwen',
  'recraft-ai',
  'runwayml',
  'vidu',
  'wan-video',
  'xai',
]);

/** Maximum number of API pages to iterate to prevent runaway polling */
const MAX_PAGES = 3;

/** Timeout for individual Replicate API requests (30 seconds) */
const API_TIMEOUT_MS = 30_000;

@Injectable()
export class CronModelWatcherService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelDiscoveryService: ModelDiscoveryService,
    private readonly modelPricingService: ModelPricingService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly platformMarginService: PlatformMarginService,
    private readonly replicateContractSyncService: ReplicateModelContractSyncService,
  ) {}

  /**
   * Weekly model discovery cron.
   * Polls Replicate API for new official models from verified creators,
   * compares against existing models in the database, and creates
   * draft entries for any newly discovered models.
   *
   * Runs weekly on Sunday at 6 AM UTC. Kept conservative until the
   * discovery pipeline is fully validated in production.
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

    try {
      // Step 0: Hydrate the operator-configured margin multiplier so every
      // applyMargin call below bakes the configured margin into model costs.
      await this.platformMarginService.hydrate();

      // Step 1: Load the provider registry without pulling unrelated JSONB.
      const registryRows = await this.modelsService.prisma.model.findMany({
        select: {
          category: true,
          endpoint: true,
          id: true,
          isActive: true,
          key: true,
          pricingType: true,
          provider: true,
          providerCostUsd: true,
          reviewedProviderContractVersion: true,
        },
        where: { isDeleted: false, organizationId: null },
      });
      const existingModels = new Map<string, ReplicateSyncModelRecord>(
        registryRows
          .filter((row) => row.provider === ModelProvider.REPLICATE)
          .map((row) => [row.endpoint || row.key, row] as const),
      );

      this.logger.log(
        `${url} loaded ${existingModels.size} existing Replicate endpoints`,
      );

      // Step 2: Poll Replicate API for official models
      const replicateModels = await this.pollReplicateModels();
      summary.totalPolled = replicateModels.length;

      this.logger.log(
        `${url} polled ${replicateModels.length} models from Replicate`,
      );

      // Step 3: Filter for verified owners only
      const officialModels = replicateModels.filter((m) =>
        VERIFIED_OWNERS.has(m.owner),
      );

      this.logger.log(
        `${url} ${officialModels.length} models from verified owners`,
      );

      // Step 4: Diff against existing models in DB.
      const newModels = officialModels.filter((m) => {
        const key = `${m.owner}/${m.name}`;
        return !existingModels.has(key);
      });

      summary.newModelsFound = newModels.length;

      if (newModels.length === 0) {
        this.logger.log(`${url} no new Replicate models discovered`);
      }

      this.logger.log(
        `${url} found ${newModels.length} new models to process`,
        {
          models: newModels.map((m) => `${m.owner}/${m.name}`),
        },
      );

      // Step 5: The public listing is intentionally bounded. Add exact fetches
      // for existing rows outside those pages so the full registry is synced.
      const candidates = new Map<string, IReplicateModel>(
        officialModels.map(
          (model) => [`${model.owner}/${model.name}`, model] as const,
        ),
      );
      for (const endpoint of existingModels.keys()) {
        if (candidates.has(endpoint)) continue;
        const [owner, name] = endpoint.split('/');
        if (!owner || !name) {
          summary.errors++;
          continue;
        }
        const providerModel =
          await this.modelDiscoveryService.fetchReplicateModel(owner, name);
        if (providerModel) {
          candidates.set(endpoint, providerModel);
        } else {
          summary.errors++;
          await this.replicateContractSyncService.recordFailure(
            'model_fetch_failed',
            summary.timestamp,
            existingModels.get(endpoint)?.id,
          );
        }
      }

      // Step 6: Create missing drafts, then persist a versioned schema/pricing
      // candidate for every observed endpoint. Reviewed runtime fields stay
      // pinned until an operator explicitly promotes the candidate.
      const syncedEndpoints: string[] = [];
      for (const listedModel of candidates.values()) {
        // relation-alias-ok: `model` is the Replicate API payload, not a Prisma model.
        const modelKey = `${listedModel.owner}/${listedModel.name}`;
        let registryModel = existingModels.get(modelKey);
        try {
          const model = await this.hydrateReplicateSchema(listedModel);
          const category = await this.detectModelCategory(model);
          const knownCost =
            this.modelPricingService.getKnownReplicateCost(modelKey);

          if (!registryModel) {
            const discoveryInput: IModelDiscoveryInput = {
              category,
              description: model.description || '',
              endpoint: modelKey,
              name: model.name,
              owner: model.owner,
              provider: ModelProvider.REPLICATE,
              providerUrl: model.url,
              versionId: model.latest_version?.id ?? null,
              ...(knownCost !== null ? { providerCostUsd: knownCost } : {}),
            };
            const draft =
              await this.modelDiscoveryService.createDraftModel(discoveryInput);
            if (!draft) continue;
            summary.draftsCreated++;
            registryModel = draft;
            await this.sendDiscoveryNotification(
              modelKey,
              category,
              draft.cost ?? 0,
              knownCost ?? 0,
              'replicate',
            );
          }

          const unitPriceUsd =
            knownCost ??
            (typeof registryModel.providerCostUsd === 'number'
              ? registryModel.providerCostUsd
              : null);
          const pricingType =
            registryModel.pricingType ??
            (knownCost !== null
              ? this.modelPricingService.estimateFromProviderCost(
                  knownCost,
                  category,
                ).pricingType
              : null);
          const syncResult =
            await this.replicateContractSyncService.synchronizeModel(
              registryModel,
              model,
              category,
              {
                pricingType,
                source:
                  knownCost !== null
                    ? 'curated-known-cost'
                    : 'reviewed-registry',
                unitPriceUsd,
              },
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
          syncedEndpoints.push(modelKey);
        } catch (error: unknown) {
          summary.errors++;
          if (registryModel?.id) {
            await this.replicateContractSyncService.recordFailure(
              'contract_sync_failed',
              summary.timestamp,
              registryModel.id,
            );
          }
          this.logger.error(`${url} failed to process model ${modelKey}`, {
            reason: error instanceof Error ? error.name : 'unknown',
          });
        }
      }

      // Step 7: Keep the coarse discovery freshness marker in sync too.
      await this.modelDiscoveryService.touchLastSyncedAt(
        ModelProvider.REPLICATE,
        syncedEndpoints,
      );

      // Step 8: Log low-cardinality summary only.
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
      await this.replicateContractSyncService.recordFailure(
        'replicate_sync_failed',
        summary.timestamp,
      );
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  /**
   * Poll the Replicate API for all publicly available models.
   * Iterates through paginated results using the `next` cursor.
   * Limits to MAX_PAGES to prevent infinite loops from API issues.
   */
  private async pollReplicateModels(): Promise<IReplicateModel[]> {
    const context = `${this.constructorName} pollReplicateModels`;
    const token = this.configService.get('REPLICATE_KEY');

    if (!token) {
      this.logger.warn(
        `${context} REPLICATE_KEY not configured, skipping poll`,
      );
      return [];
    }

    const allModels: IReplicateModel[] = [];
    let nextUrl: string | null = 'https://api.replicate.com/v1/models';
    let pageCount = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          this.logger.error(
            `${context} Replicate API returned ${response.status} on page ${pageCount + 1}`,
          );
          break;
        }

        const data = (await response.json()) as IReplicateModelsResponse;

        if (data.results && data.results.length > 0) {
          allModels.push(...data.results);
        }

        nextUrl = data.next;
        pageCount++;

        this.logger.log(
          `${context} fetched page ${pageCount}, ${data.results?.length || 0} models (total: ${allModels.length})`,
        );
      } catch (error: unknown) {
        if ((error as Error)?.name === 'AbortError') {
          this.logger.error(
            `${context} request timed out on page ${pageCount + 1}`,
          );
        } else {
          this.logger.error(`${context} error fetching page ${pageCount + 1}`, {
            error,
          });
        }
        break;
      }
    }

    if (pageCount >= MAX_PAGES) {
      this.logger.warn(
        `${context} reached max page limit (${MAX_PAGES}), some models may not have been fetched`,
      );
    }

    return allModels;
  }

  /**
   * Send a Discord notification for a newly discovered model.
   * Silently swallows errors to avoid failing the watcher.
   */
  private async sendDiscoveryNotification(
    modelKey: string,
    category: string,
    estimatedCost: number,
    providerCostUsd: number,
    provider: string,
  ): Promise<void> {
    try {
      await this.notificationsService.sendModelDiscoveryNotification({
        category,
        estimatedCost,
        modelKey,
        provider,
        providerCostUsd,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} notification failed for ${modelKey}`,
        { error },
      );
    }
  }

  private async hydrateReplicateSchema(
    model: IReplicateModel,
  ): Promise<IReplicateModel> {
    const latestVersion = model.latest_version;
    if (
      !latestVersion?.id ||
      Object.keys(latestVersion.openapi_schema ?? {}).length > 0
    ) {
      return model;
    }

    const detail = await this.modelDiscoveryService.fetchReplicateSchema(
      model.owner,
      model.name,
      latestVersion.id,
    );
    if (!detail) return model;

    return {
      ...model,
      latest_version: {
        ...latestVersion,
        openapi_schema: detail.openapi_schema,
      },
    };
  }

  /**
   * Detect the category for a Replicate model.
   * Uses the OpenAPI schema from the latest version if available,
   * otherwise falls back to description-based detection.
   */
  private async detectModelCategory(
    model: IReplicateModel,
  ): Promise<ModelCategory> {
    // If there's a latest version with a schema, use it for detection
    if (model.latest_version?.id && model.latest_version?.openapi_schema) {
      return this.modelDiscoveryService.detectCategory(
        model.latest_version.openapi_schema,
        model.description,
      );
    }

    // If there's a version ID but no inline schema, fetch it
    if (model.latest_version?.id) {
      const versionDetail =
        await this.modelDiscoveryService.fetchReplicateSchema(
          model.owner,
          model.name,
          model.latest_version.id,
        );

      if (versionDetail?.openapi_schema) {
        return this.modelDiscoveryService.detectCategory(
          versionDetail.openapi_schema,
          model.description,
        );
      }
    }

    // Fall back to description-only detection
    return this.modelDiscoveryService.detectCategory({}, model.description);
  }
}
