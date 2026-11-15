import { ModelsService } from '@api/collections/models/services/models.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import {
  isKnownUnavailableModel,
  PROVIDER_ENDPOINT_DATA_ERRORS,
} from '@genfeedai/pricing';
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
import {
  createModelDiscoveryRunSummary,
  finalizeModelScanReport,
} from '@workers/services/model-scan-report.util';

/** Lifecycle status fal reports for endpoints that still accept requests */
const FAL_MODEL_STATUS_ACTIVE = 'active';

/** Sync failure code of a row that names an endpoint fal does not host. */
const DATA_ERROR_CODE = 'data_error:wrong_provider_endpoint';

/**
 * A row nobody can act on a failure for: inactive, or already recorded as
 * unavailable in the rate sheet's exception list. It never raises a failure
 * alert and never appears in a scan report.
 */
function isQuietRow(
  row: Pick<FalSyncModelRecord, 'endpoint' | 'isActive' | 'key'>,
): boolean {
  return (
    !row.isActive ||
    isKnownUnavailableModel(row.key ?? row.endpoint) ||
    isKnownUnavailableModel(row.endpoint)
  );
}

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

    const summary = createModelDiscoveryRunSummary('fal');

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
          lifecycle: true,
          provider: true,
          providerSyncFailureCode: true,
          reviewedProviderContractVersion: true,
        },
        where: {
          isDeleted: false,
          organizationId: null,
          provider: ModelProvider.FAL,
        },
      });
      // A retired row is never offered or priced, and fal may no longer serve
      // its endpoint, so it neither refreshes nor alerts.
      const registryModels = new Map<string, FalSyncModelRecord>(
        registryRows
          .filter((row) => row.lifecycle !== ModelLifecycle.RETIRED)
          .map((row) => [row.endpoint || row.key, row] as const),
      );
      // A row stored under fal for an endpoint fal never served is a data
      // error, reported once. Asking fal about it every run only alerts.
      for (const [endpoint, row] of registryModels) {
        if (!Object.hasOwn(PROVIDER_ENDPOINT_DATA_ERRORS, endpoint)) continue;
        registryModels.delete(endpoint);
        await this.recordDataError(row, endpoint, summary);
      }

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
        if (await this.isListedButUnaddressable(endpoint)) {
          // Fal exposes no schema or price for it; its reviewed rate stays.
          this.logger.log(`${url} ${endpoint} is listed but not addressable`);
          continue;
        }
        summary.errors++;
        await this.falContractSyncService.recordFailure(
          'model_fetch_failed',
          summary.timestamp,
          registryModel.id,
        );
        if (!isQuietRow(registryModel))
          await this.sendFailureAlert(
            summary,
            endpoint,
            'model_fetch_failed',
            Boolean(registryModel.reviewedProviderContractVersion),
          );
      }

      // Low-cardinality observability only. Raw schemas, pricing, account
      // metadata, and credentials never enter logs.
      finalizeModelScanReport(summary);
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
      await this.sendFailureAlert(summary, 'provider:fal', 'fal_sync_failed');
      finalizeModelScanReport(summary);
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  /** The row names an endpoint fal never hosted. Reported once. */
  private async recordDataError(
    row: FalSyncModelRecord,
    modelKey: string,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    if (row.providerSyncFailureCode === DATA_ERROR_CODE) return;
    await this.falContractSyncService.recordFailure(
      DATA_ERROR_CODE,
      summary.timestamp,
      row.id,
    );
    summary.report.dataErrors.push({
      modelKey,
      reason: PROVIDER_ENDPOINT_DATA_ERRORS[modelKey] ?? DATA_ERROR_CODE,
    });
  }

  private async isListedButUnaddressable(endpoint: string): Promise<boolean> {
    try {
      return await this.falPlatformClient.isListedActive(endpoint);
    } catch {
      return false;
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
      await this.reportSyncResult(syncResult, registryModel, summary);
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
      if (!isQuietRow(registryModel))
        await this.sendFailureAlert(
          summary,
          model.endpoint_id,
          'contract_sync_failed',
        );
      this.logger.error(`${url} failed to process model ${model.endpoint_id}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /** Report a model whose refresh threw or could not be fetched, and tell ops. */
  private async sendFailureAlert(
    summary: IModelDiscoveryRunSummary,
    modelKey: string,
    code: string,
    hasApprovedRate = true,
  ): Promise<void> {
    const reason = hasApprovedRate
      ? `The fal price refresh failed (${code}); the last approved rate keeps charging.`
      : `The fal price refresh failed (${code}); this model has no approved rate yet.`;
    summary.report.unreadable.push({ code, modelKey, reason });
    try {
      await dispatchModelPricingUnavailableAlert(
        this.activityRecorder,
        { code, modelKey, provider: ModelProvider.FAL, reason },
        summary.timestamp,
      );
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failure alert failed`, {
        error,
      });
    }
  }

  /**
   * Put a refresh's outcome on the report and tell ops about a changed price or
   * one that could not be read. Silently swallows errors: an alert failure must
   * never fail the watcher.
   */
  private async reportSyncResult(
    result: FalContractSyncResult,
    row: FalSyncModelRecord,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    try {
      if (result.priceChange) {
        const change = result.priceChange;
        summary.report.priceChanges.push({
          changes: change.changes,
          isUrgent: change.isUrgent,
          modelKey: change.modelKey,
          pendingRateHash: change.pendingRateHash,
          sourceUrl: change.sourceUrl,
          urgentReason: change.urgentReason,
        });
        await dispatchModelPriceChangeAlert(this.activityRecorder, change);
      }
      if (result.refreshFailure && !isQuietRow(row)) {
        const failure = result.refreshFailure;
        summary.report.unreadable.push({
          code: failure.code,
          modelKey: failure.modelKey,
          reason: failure.reason,
        });
        await dispatchModelPricingUnavailableAlert(
          this.activityRecorder,
          failure,
          summary.timestamp,
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} pricing alert failed`, {
        error,
      });
    }
  }
}
