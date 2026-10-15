import { ModelsService } from '@api/collections/models/services/models.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { FalPlatformClient } from '@workers/crons/fal-model-watcher/fal-platform.client';
import type {
  IFalModel,
  IModelDiscoveryRunSummary,
} from '@workers/interfaces/model-discovery.interface';
import {
  type FalContractSyncResult,
  FalModelContractSyncService,
  type FalSyncModelRecord,
} from '@workers/services/fal-model-contract-sync.service';
import {
  dispatchModelPriceChangeAlert,
  dispatchModelPricingUnavailableAlert,
} from '@workers/services/model-pricing-alerts.util';

/** Lifecycle status fal reports for endpoints that still accept requests */
const FAL_MODEL_STATUS_ACTIVE = 'active';

@Injectable()
export class CronFalModelWatcherService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly configService: ConfigService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly falPlatformClient: FalPlatformClient,
    private readonly falContractSyncService: FalModelContractSyncService,
  ) {}

  /**
   * Refresh the schema and price contract of every fal endpoint already in the
   * registry. Fal lists well over a thousand endpoints, so this never drafts
   * new ones: an operator adds a fal model to the catalog first.
   */
  async refreshRegistryModels(): Promise<IModelDiscoveryRunSummary> {
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
      const registryRows = await this.modelsService.prisma.model.findMany({
        select: {
          endpoint: true,
          id: true,
          isActive: true,
          isFree: true,
          key: true,
          provider: true,
          reviewedProviderContractVersion: true,
        },
        where: {
          isDeleted: false,
          organizationId: null,
          provider: ModelProvider.FAL,
        },
      });
      const registryModels = new Map<string, FalSyncModelRecord>(
        registryRows.map((row) => [row.endpoint || row.key, row] as const),
      );

      this.logger.log(
        `${url} loaded ${registryModels.size} registry fal endpoints`,
      );
      if (registryModels.size === 0) return summary;

      const falModels = await this.falPlatformClient.fetchModels([
        ...registryModels.keys(),
      ]);
      summary.totalPolled = falModels.length;

      const routableModels = falModels.filter((model) =>
        this.isRoutableModel(model),
      );
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

      const routableEndpoints = new Set(
        routableModels.map((model) => model.endpoint_id),
      );
      for (const model of routableModels) {
        const registryModel = registryModels.get(model.endpoint_id);
        if (registryModel)
          await this.syncRegistryModel(
            model,
            registryModel,
            pricingByEndpoint,
            summary,
            url,
          );
      }
      for (const [endpoint, registryModel] of registryModels) {
        if (routableEndpoints.has(endpoint)) continue;
        summary.errors++;
        await this.falContractSyncService.recordFailure(
          'model_fetch_failed',
          summary.timestamp,
          registryModel.id,
        );
        await this.sendFailureAlert(
          endpoint,
          'model_fetch_failed',
          summary.timestamp,
        );
      }

      // Low-cardinality observability only. Raw schemas, pricing, account
      // metadata, and credentials never enter logs.
      this.logger.log(`${url} completed`, {
        errors: summary.errors,
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
      // One deduped provider-level alert: every fal rate is unconfirmed.
      await this.sendFailureAlert(
        'provider:fal',
        'fal_sync_failed',
        summary.timestamp,
      );
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  /** Fal still accepts requests for this endpoint. */
  private isRoutableModel(model: IFalModel): boolean {
    const status = model.metadata?.status;

    return !status || status === FAL_MODEL_STATUS_ACTIVE;
  }

  /** Synchronize one registry fal endpoint; never throws. */
  private async syncRegistryModel(
    model: IFalModel,
    registryModel: FalSyncModelRecord,
    pricingByEndpoint: ReadonlyMap<string, Array<Record<string, unknown>>>,
    summary: IModelDiscoveryRunSummary,
    url: string,
  ): Promise<void> {
    try {
      const syncResult = await this.falContractSyncService.synchronizeModel(
        registryModel,
        model,
        pricingByEndpoint.get(model.endpoint_id) ?? [],
        summary.timestamp,
      );
      await this.sendPricingAlerts(syncResult, summary.timestamp);
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
      await this.falContractSyncService.recordFailure(
        'contract_sync_failed',
        summary.timestamp,
        registryModel.id,
      );
      await this.sendFailureAlert(
        model.endpoint_id,
        'contract_sync_failed',
        summary.timestamp,
      );
      this.logger.error(`${url} failed to process model ${model.endpoint_id}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /** Ops Discord for a model whose refresh threw or could not be fetched. */
  private async sendFailureAlert(
    modelKey: string,
    code: string,
    now: Date,
  ): Promise<void> {
    try {
      await dispatchModelPricingUnavailableAlert(
        this.activityRecorder,
        {
          modelKey,
          provider: ModelProvider.FAL,
          reason: `The fal price refresh failed (${code}); the last approved rate keeps charging.`,
        },
        now,
      );
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failure alert failed`, {
        error,
      });
    }
  }

  /**
   * Ops Discord for a refresh that found a changed price or could not read one.
   * Silently swallows errors: an alert failure must never fail the watcher.
   */
  private async sendPricingAlerts(
    result: FalContractSyncResult,
    now: Date,
  ): Promise<void> {
    try {
      if (result.priceChange)
        await dispatchModelPriceChangeAlert(
          this.activityRecorder,
          result.priceChange,
        );
      if (result.refreshFailure)
        await dispatchModelPricingUnavailableAlert(
          this.activityRecorder,
          result.refreshFailure,
          now,
        );
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} pricing alert failed`, {
        error,
      });
    }
  }
}
