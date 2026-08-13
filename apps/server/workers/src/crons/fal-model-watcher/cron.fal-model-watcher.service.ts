import { ModelsService } from '@api/collections/models/services/models.service';
import { isFalDestination } from '@api/collections/models/utils/model-key.util';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';
import type {
  IFalModel,
  IFalModelsResponse,
  IModelDiscoveryInput,
  IModelDiscoveryRunSummary,
} from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';

/** fal model search API — authentication is optional but rate limits are looser with a key */
const FAL_MODELS_URL = 'https://api.fal.ai/v1/models';

/** Maximum number of API pages to iterate to prevent runaway polling */
const MAX_PAGES = 5;

/** Page size requested from the fal model search API */
const PAGE_LIMIT = 100;

/** Timeout for individual fal API requests (30 seconds) */
const API_TIMEOUT_MS = 30_000;

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
  @Cron('0 7 * * 0')
  async discoverNewModels(): Promise<IModelDiscoveryRunSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const summary: IModelDiscoveryRunSummary = {
      draftsCreated: 0,
      errors: 0,
      newModelsFound: 0,
      timestamp: new Date(),
      totalPolled: 0,
    };

    try {
      // Step 1: Fetch all known model keys from the registry. The diff only
      // needs keys, so read them straight off the delegate instead of pulling
      // every row's JSONB config through `modelsService.find`.
      const registryRows = await this.modelsService.prisma.model.findMany({
        select: { key: true },
        where: { isDeleted: false },
      });
      const existingKeys = new Set(
        registryRows
          .map((row) => row.key)
          .filter((key): key is string => typeof key === 'string'),
      );

      this.logger.log(`${url} loaded ${existingKeys.size} existing model keys`);

      // Step 2: Poll the fal model search API
      const falModels = await this.pollFalModels();
      summary.totalPolled = falModels.length;

      this.logger.log(`${url} polled ${falModels.length} models from fal`);

      // Step 3: Keep only routable, non-deprecated endpoints
      const routableModels = falModels.filter((model) =>
        this.isRoutableModel(model),
      );

      this.logger.log(`${url} ${routableModels.length} routable fal endpoints`);

      // Step 4: Diff against the registry
      const newModels = routableModels.filter(
        (model) => !existingKeys.has(model.endpoint_id),
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

      // Step 5: Create draft entries for new fal models
      for (const model of newModels) {
        try {
          const draft = await this.modelDiscoveryService.createDraftModel(
            this.buildDiscoveryInput(model),
          );

          if (draft) {
            summary.draftsCreated++;
            await this.sendDiscoveryNotification(
              model.endpoint_id,
              this.detectModelCategory(model),
              draft.cost ?? 0,
            );
          }
        } catch (error: unknown) {
          summary.errors++;
          this.logger.error(
            `${url} failed to process model ${model.endpoint_id}`,
            { error },
          );
        }
      }

      // Step 6: Touch lastSyncedAt for fal models seen in this run.
      const syncedKeys = routableModels
        .map((model) => model.endpoint_id)
        .filter((key) => existingKeys.has(key));
      await this.modelDiscoveryService.touchLastSyncedAt(syncedKeys);

      // Step 7: Log summary
      this.logger.log(`${url} completed`, {
        draftsCreated: summary.draftsCreated,
        errors: summary.errors,
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
   * Poll the fal model search API, following `next_cursor` until it runs out.
   * Limits to MAX_PAGES to prevent infinite loops from API issues.
   *
   * Soft-fails when FAL_API_KEY is absent: self-hosted installs without fal
   * credentials skip discovery instead of erroring the worker.
   */
  private async pollFalModels(): Promise<IFalModel[]> {
    const context = `${this.constructorName} pollFalModels`;
    const token = this.configService.get('FAL_API_KEY');

    if (!token) {
      this.logger.warn(`${context} FAL_API_KEY not configured, skipping poll`);
      return [];
    }

    const allModels: IFalModel[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    while (pageCount < MAX_PAGES) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const requestUrl = new URL(FAL_MODELS_URL);
        requestUrl.searchParams.set('limit', String(PAGE_LIMIT));
        requestUrl.searchParams.set('status', FAL_MODEL_STATUS_ACTIVE);
        if (cursor) {
          requestUrl.searchParams.set('cursor', cursor);
        }

        const response = await fetch(requestUrl.toString(), {
          headers: {
            Authorization: `Key ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          this.logger.error(
            `${context} fal API returned ${response.status} on page ${pageCount + 1}`,
          );
          break;
        }

        const data = (await response.json()) as IFalModelsResponse;

        if (data.models && data.models.length > 0) {
          allModels.push(...data.models);
        }

        pageCount++;

        this.logger.log(
          `${context} fetched page ${pageCount}, ${data.models?.length || 0} models (total: ${allModels.length})`,
        );

        if (!data.has_more || !data.next_cursor) {
          return allModels;
        }

        cursor = data.next_cursor;
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
   * A fal endpoint is only worth drafting when generation can actually reach it.
   *
   * Generation traffic is routed by key prefix (`isFalDestination`), so only the
   * `fal-ai/` namespace reaches `FalService`. fal also hosts third-party
   * namespaces (`google/…`, `openai/…`) whose endpoint ids collide with
   * Replicate keys and would route to the wrong provider — discovery ignores
   * everything outside `fal-ai/`, plus anything deprecated upstream.
   */
  private isRoutableModel(model: IFalModel): boolean {
    if (!isFalDestination(model.endpoint_id)) {
      return false;
    }

    const status = model.metadata?.status;

    return !status || status === FAL_MODEL_STATUS_ACTIVE;
  }

  /**
   * Build the shared discovery input from a fal endpoint. The registry key is
   * the fal endpoint id verbatim, so `owner` is its first segment and `name`
   * carries the remaining (possibly nested) path.
   */
  private buildDiscoveryInput(model: IFalModel): IModelDiscoveryInput {
    const [owner, ...rest] = model.endpoint_id.split('/');
    const metadata = model.metadata;
    const displayName = metadata?.display_name?.trim();

    return {
      category: this.detectModelCategory(model),
      description: metadata?.description || '',
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
        // fal's model search API publishes no per-run price; the draft is
        // priced from category/creator patterns and reviewed before activation.
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
