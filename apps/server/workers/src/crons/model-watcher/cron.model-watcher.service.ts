import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';
import type {
  IModelDiscoveryInput,
  IModelDiscoveryRunSummary,
  IReplicateModel,
  IReplicateModelsResponse,
} from '@workers/interfaces/model-discovery.interface';
import { FalDiscoveryService } from '@workers/services/fal-discovery.service';
import { HuggingFaceDiscoveryService } from '@workers/services/hugging-face-discovery.service';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { ModelPricingService } from '@workers/services/model-pricing.service';

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
  'openai',
  'prunaai',
  'qwen',
  'runwayml',
]);

/** Maximum number of API pages to iterate to prevent runaway polling */
const MAX_PAGES = 20;

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
    private readonly falDiscoveryService: FalDiscoveryService,
    private readonly huggingFaceDiscoveryService: HuggingFaceDiscoveryService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Daily model discovery cron.
   * Polls Replicate API for new official models from verified creators,
   * compares against existing models in the database, and creates
   * draft entries for any newly discovered models.
   *
   * Runs daily at 6 AM UTC. Disabled in development to prevent
   * unnecessary API calls during local development.
   */
  @Cron('0 6 * * *')
  async discoverNewModels(): Promise<IModelDiscoveryRunSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const summary: IModelDiscoveryRunSummary = {
      draftsCreated: 0,
      errors: 0,
      falDraftsCreated: 0,
      falNewFound: 0,
      falPolled: 0,
      hfDraftsCreated: 0,
      hfNewFound: 0,
      hfPolled: 0,
      newModelsFound: 0,
      timestamp: new Date(),
      totalPolled: 0,
    };

    try {
      // Step 1: Fetch all known model keys from database
      const existingModels = await this.modelsService.findAllActive();
      const allModels = await this.modelsService.find({ isDeleted: false });
      const existingKeys = new Set(allModels.map((m: ModelDocument) => m.key));

      this.logger.log(`${url} loaded ${existingKeys.size} existing model keys`);

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

      // Step 4: Diff against existing models in DB
      const newModels = officialModels.filter((m) => {
        const key = `${m.owner}/${m.name}`;
        return !existingKeys.has(key);
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

      // Step 5: Create draft entries for new Replicate models
      for (const model of newModels) {
        try {
          const category = await this.detectModelCategory(model);
          const modelKey = `${model.owner}/${model.name}`;

          const discoveryInput: IModelDiscoveryInput = {
            category,
            description: model.description || '',
            name: model.name,
            owner: model.owner,
            provider: ModelProvider.REPLICATE,
            replicateUrl: model.url,
            versionId: model.latest_version?.id ?? null,
          };

          // Check if we have a known provider cost for margin-based pricing
          const knownCost =
            this.modelPricingService.getKnownReplicateCost(modelKey);
          if (knownCost !== null) {
            discoveryInput.providerCostUsd = knownCost;
          }

          const draft =
            await this.modelDiscoveryService.createDraftModel(discoveryInput);

          if (draft) {
            summary.draftsCreated++;
            await this.sendDiscoveryNotification(
              modelKey,
              category,
              draft.cost ?? 0,
              knownCost ?? 0,
              'replicate',
            );
          }
        } catch (error: unknown) {
          summary.errors++;
          this.logger.error(
            `${url} failed to process model ${model.owner}/${model.name}`,
            { error },
          );
        }
      }

      // Step 6: Poll fal.ai for new models
      await this.pollFalModels(summary, existingKeys);

      // Step 7: Poll HuggingFace for new models
      await this.pollHuggingFaceModels(summary, existingKeys);

      // Step 8: Touch lastSyncedAt for all previously discovered models seen in this run
      const syncedKeys = [
        ...officialModels.map((m) => `${m.owner}/${m.name}`),
      ].filter((k) => existingKeys.has(k));
      await this.modelDiscoveryService.touchLastSyncedAt(syncedKeys);

      // Step 9: Log summary
      this.logger.log(`${url} completed`, {
        draftsCreated: summary.draftsCreated,
        errors: summary.errors,
        falDraftsCreated: summary.falDraftsCreated,
        falNewFound: summary.falNewFound,
        falPolled: summary.falPolled,
        hfDraftsCreated: summary.hfDraftsCreated,
        hfNewFound: summary.hfNewFound,
        hfPolled: summary.hfPolled,
        newModelsFound: summary.newModelsFound,
        totalPolled: summary.totalPolled,
      });

      return summary;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
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
   * Poll fal.ai for new models and create drafts.
   * Isolated from Replicate polling so errors don't affect each other.
   */
  private async pollFalModels(
    summary: IModelDiscoveryRunSummary,
    existingKeys: Set<string>,
  ): Promise<void> {
    const context = `${this.constructorName} pollFalModels`;

    if (!this.falDiscoveryService.isConfigured()) {
      this.logger.log(`${context} skipped — FAL_API_KEY not configured`);
      return;
    }

    try {
      const falModels = await this.falDiscoveryService.discoverModels();
      summary.falPolled = falModels.length;

      this.logger.log(
        `${context} polled ${falModels.length} models from fal.ai`,
      );

      const newFalModels = falModels.filter(
        (m) => m.key && !existingKeys.has(m.key),
      );
      summary.falNewFound = newFalModels.length;

      if (newFalModels.length === 0) {
        this.logger.log(`${context} no new fal.ai models discovered`);
        return;
      }

      this.logger.log(
        `${context} found ${newFalModels.length} new fal.ai models`,
      );

      for (const falModel of newFalModels) {
        try {
          const modelKey = falModel.key as string;
          const [owner, ...nameParts] = modelKey.split('/');
          const name = nameParts.join('/');
          const category = falModel.category || ModelCategory.IMAGE;

          // Fetch real-time pricing from fal.ai
          const pricingCredits =
            await this.falDiscoveryService.getModelPricing(modelKey);
          const providerCostUsd = falModel.costPerUnit ?? 0;

          const discoveryInput: IModelDiscoveryInput = {
            category,
            description: falModel.description || '',
            name,
            owner,
            provider: ModelProvider.FAL,
            providerCostUsd,
            replicateUrl: '',
            versionId: null,
          };

          const draft =
            await this.modelDiscoveryService.createDraftModel(discoveryInput);

          if (draft) {
            summary.falDraftsCreated = (summary.falDraftsCreated ?? 0) + 1;
            await this.sendDiscoveryNotification(
              modelKey,
              category,
              pricingCredits || draft.cost || 0,
              providerCostUsd,
              'fal',
            );
          }
        } catch (error: unknown) {
          summary.errors++;
          this.logger.error(
            `${context} failed to process fal model ${falModel.key}`,
            { error },
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(`${context} fal.ai polling failed`, error);
    }
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

  /**
   * Poll HuggingFace Hub for new content-creation models and create drafts.
   * Isolated from Replicate/Fal polling so errors don't affect each other.
   */
  private async pollHuggingFaceModels(
    summary: IModelDiscoveryRunSummary,
    existingKeys: Set<string>,
  ): Promise<void> {
    const context = `${this.constructorName} pollHuggingFaceModels`;

    try {
      const hfModels = await this.huggingFaceDiscoveryService.discoverModels();
      summary.hfPolled = hfModels.length;

      this.logger.log(
        `${context} polled ${hfModels.length} models from HuggingFace`,
      );

      const newHfModels = hfModels.filter(
        (m) => m.key && !existingKeys.has(m.key),
      );
      summary.hfNewFound = newHfModels.length;

      if (newHfModels.length === 0) {
        this.logger.log(`${context} no new HuggingFace models discovered`);
        return;
      }

      this.logger.log(
        `${context} found ${newHfModels.length} new HuggingFace models`,
      );

      for (const hfModel of newHfModels) {
        try {
          const modelKey = hfModel.key as string;
          const parts = modelKey.split('/');
          const owner = parts[0] ?? modelKey;
          const name = parts.slice(1).join('/') || modelKey;
          const category = hfModel.category ?? ModelCategory.IMAGE;

          const discoveryInput: IModelDiscoveryInput = {
            category,
            description: hfModel.description || '',
            name,
            owner,
            provider: ModelProvider.HUGGINGFACE,
            providerCostUsd: 0,
            replicateUrl: '',
            versionId: null,
          };

          const draft =
            await this.modelDiscoveryService.createDraftModel(discoveryInput);

          if (draft) {
            summary.hfDraftsCreated = (summary.hfDraftsCreated ?? 0) + 1;
            await this.sendDiscoveryNotification(
              modelKey,
              category,
              draft.cost ?? 0,
              0,
              'huggingface',
            );
          }
        } catch (error: unknown) {
          summary.errors++;
          this.logger.error(
            `${context} failed to process HuggingFace model ${hfModel.key}`,
            { error },
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(`${context} HuggingFace polling failed`, error);
    }
  }
}
