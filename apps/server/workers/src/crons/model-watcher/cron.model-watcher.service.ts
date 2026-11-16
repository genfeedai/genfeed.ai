import { ModelsService } from '@api/collections/models/services/models.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import { resolveFlux3ReplicateEndpoint } from '@genfeedai/contracts/constants';
import {
  isKnownUnavailableModel,
  PROVIDER_ENDPOINT_DATA_ERRORS,
  type ReplicateBillingMediaFamily,
  replicateBillingMediaFamily,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  IModelCategoryDecision,
  IModelDiscoveryInput,
  IModelDiscoveryRunSummary,
  IReplicateModel,
  IReplicateModelsResponse,
} from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { dispatchModelScanCard } from '@workers/services/model-pricing-alerts.util';
import {
  createModelDiscoveryRunSummary,
  finalizeModelScanReport,
} from '@workers/services/model-scan-report.util';
import { PlatformMarginService } from '@workers/services/platform-margin.service';
import {
  prepareReplicateModelContract,
  type ReplicateDraftPrice,
  readReplicateDraftPrice,
} from '@workers/services/replicate-model-contract.util';
import {
  type ReplicateContractSyncResult,
  ReplicateModelContractSyncService,
  type ReplicateSyncModelRecord,
} from '@workers/services/replicate-model-contract-sync.service';

/**
 * Hard bound on the pages one run reads from Replicate's public model list
 * (25 models per page). The list is followed to its end; the bound only guards
 * against a cursor that never ends, and hitting it is a run error, not a
 * truncation. Replicate documents no filter for official models, so the whole
 * list is read and `is_official` is applied afterwards.
 */
const MAX_PAGES = 5000;

/**
 * Pause between list pages. Replicate documents 3000 requests per minute for
 * its non-prediction endpoints; this keeps a full listing near 600 per minute.
 */
const PAGE_DELAY_MS = 100;

/** Report code for a listing that could not be read to its end. */
const LISTING_INCOMPLETE_CODE = 'replicate_listing_incomplete';

/** Timeout for individual Replicate API requests (30 seconds) */
const API_TIMEOUT_MS = 30_000;

/** Sync failure codes for the states the provider put a model in. */
const DELISTED_CODE = 'delisted_by_provider';
const REMOVED_CODE = 'removed_by_provider';
const DATA_ERROR_CODE = 'data_error:wrong_provider_endpoint';

/** The page Replicate serves a model's price on, which is gone for a delisted model. */
const PAGE_NOT_FOUND = 'page_status_404';

/** The models read from the list, and why the read stopped early, if it did. */
interface ReplicateListing {
  failure: string | null;
  models: IReplicateModel[];
}

/** `owner/name` of an endpoint that may pin a version (`meta/musicgen:671ac…`). */
function replicateModelPath(endpoint: string): string {
  return endpoint.split(':')[0] ?? endpoint;
}

/**
 * A row nobody can act on a failure for: inactive, or already recorded as
 * unavailable in the rate sheet's exception list. It never raises a failure
 * alert and never appears in a scan report.
 */
function isQuietRow(
  row: Pick<ReplicateSyncModelRecord, 'endpoint' | 'isActive' | 'key'>,
): boolean {
  return (
    !row.isActive ||
    isKnownUnavailableModel(row.key ?? row.endpoint) ||
    isKnownUnavailableModel(row.endpoint)
  );
}

@Injectable()
export class CronModelWatcherService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly listPageLimit: number = MAX_PAGES;
  private readonly listPageDelayMs: number = PAGE_DELAY_MS;

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelDiscoveryService: ModelDiscoveryService,
    private readonly configService: ConfigService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly platformMarginService: PlatformMarginService,
    private readonly replicateContractSyncService: ReplicateModelContractSyncService,
  ) {}

  /**
   * Weekly model discovery cron.
   * Polls Replicate API for new official models, compares against existing
   * models in the database, and creates inactive draft entries for any newly
   * discovered models. A draft carries the price and billing unit read from the
   * model's own page; it never carries a guessed credit price.
   *
   * Returns the run summary, whose `report` groups what an operator has to do.
   *
   * Runs weekly on Sunday at 6 AM UTC. Kept conservative until the
   * discovery pipeline is fully validated in production.
   */
  async discoverNewModels(): Promise<IModelDiscoveryRunSummary> {
    const summary = await this.scanReplicate();
    await this.sendScanCard(summary);
    return summary;
  }

  private async scanReplicate(): Promise<IModelDiscoveryRunSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const summary = createModelDiscoveryRunSummary('replicate');

    try {
      // Step 0: Hydrate the operator-configured margin multiplier so the
      // margin guard compares provider cost with the price we really charge.
      await this.platformMarginService.hydrate();

      // Step 1: Load the provider registry without pulling unrelated JSONB.
      const existingModels = await this.loadReplicateRegistry();

      this.logger.log(
        `${url} loaded ${existingModels.size} existing Replicate endpoints`,
      );

      // Step 2: Poll Replicate API for models
      const { failure: listingFailure, models: replicateModels } =
        await this.pollReplicateModels();
      summary.totalPolled = replicateModels.length;

      this.reportListingFailure(summary, listingFailure);

      this.logger.log(
        `${url} polled ${replicateModels.length} models from Replicate`,
      );

      // Step 3: Keep the models Replicate itself hosts and maintains. The
      // API's own flag decides, so no owner list has to be kept by hand.
      const officialModels = replicateModels.filter(
        (m) => m.is_official === true,
      );

      this.logger.log(`${url} ${officialModels.length} official models`);

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

      // Step 5: Add exact fetches for registry rows the listing does not
      // carry (no longer official, or removed), so the full registry is synced.
      const candidates = new Map<string, IReplicateModel>(
        officialModels.map(
          (model) => [`${model.owner}/${model.name}`, model] as const,
        ),
      );
      await this.fetchMissingRegistryModels(
        candidates,
        existingModels,
        replicateModels.length,
        summary,
      );

      // Step 6: Create missing drafts, then persist a versioned schema/pricing
      // candidate for every observed endpoint. Reviewed runtime fields stay
      // pinned until an operator explicitly promotes the candidate.
      const syncedEndpoints: string[] = [];
      for (const [endpoint, listedModel] of candidates) {
        if (
          await this.syncListedModel(
            endpoint,
            listedModel,
            existingModels,
            summary,
            url,
          )
        )
          syncedEndpoints.push(endpoint);
      }

      // Step 7: Keep the coarse discovery freshness marker in sync too.
      await this.modelDiscoveryService.touchLastSyncedAt(
        ModelProvider.REPLICATE,
        syncedEndpoints,
      );

      // Step 8: Log low-cardinality summary only.
      const report = finalizeModelScanReport(summary);
      this.logger.log(`${url} completed`, {
        dataErrors: report.dataErrors.length,
        delisted: report.delisted.length,
        draftsCreated: summary.draftsCreated,
        errors: summary.errors,
        newModelsFound: summary.newModelsFound,
        priceChanges: report.priceChanges.length,
        providerContractsDrifted: summary.providerContractsDrifted,
        providerContractsQuarantined: summary.providerContractsQuarantined,
        providerContractsSynchronized: summary.providerContractsSynchronized,
        removedByProvider: report.removedByProvider.length,
        totalPolled: summary.totalPolled,
        unreadable: report.unreadable.length,
      });

      return summary;
    } catch (error: unknown) {
      summary.errors++;
      await this.replicateContractSyncService.recordFailure(
        'replicate_sync_failed',
        summary.timestamp,
      );
      // One deduped provider-level alert: every Replicate rate is unconfirmed.
      this.reportUnreadable(
        summary,
        'provider:replicate',
        'replicate_sync_failed',
        'The Replicate price refresh failed (replicate_sync_failed); the last approved rate keeps charging.',
      );
      finalizeModelScanReport(summary);
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  /** The non-organization Replicate registry rows, keyed by endpoint. */
  private async loadReplicateRegistry(): Promise<
    Map<string, ReplicateSyncModelRecord>
  > {
    const registryRows = await this.modelsService.prisma.model.findMany({
      select: {
        category: true,
        endpoint: true,
        id: true,
        isActive: true,
        isFree: true,
        key: true,
        lifecycle: true,
        pricingType: true,
        provider: true,
        providerCostUsd: true,
        providerSyncFailureCode: true,
        providerSyncStatus: true,
        reviewedProviderContractVersion: true,
      },
      where: { isDeleted: false, organizationId: null },
    });
    return new Map<string, ReplicateSyncModelRecord>(
      registryRows
        .filter((row) => row.provider === ModelProvider.REPLICATE)
        .map((row) => [row.endpoint || row.key, row] as const),
    );
  }

  /**
   * A listing that stopped early makes "new model" unreliable this run, so it
   * is an error on the report and the card, not a log line. The models read so
   * far are still processed and the registry still refreshes.
   */
  private reportListingFailure(
    summary: IModelDiscoveryRunSummary,
    failure: string | null,
  ): void {
    if (!failure) return;
    summary.errors++;
    this.reportUnreadable(
      summary,
      'provider:replicate',
      LISTING_INCOMPLETE_CODE,
      failure,
    );
  }

  /**
   * Poll the Replicate API for all publicly available models.
   * Follows the `next` cursor to the end, pausing between pages. Stops early
   * with a `failure` when a page fails, the cursor repeats, or the page bound
   * is hit, so the caller can report the listing as incomplete.
   */
  private async pollReplicateModels(): Promise<ReplicateListing> {
    const context = `${this.constructorName} pollReplicateModels`;
    const token = this.configService.get('REPLICATE_KEY');

    if (!token) {
      this.logger.warn(
        `${context} REPLICATE_KEY not configured, skipping poll`,
      );
      return { failure: null, models: [] };
    }

    const allModels: IReplicateModel[] = [];
    const seenUrls = new Set<string>();
    let nextUrl: string | null = 'https://api.replicate.com/v1/models';
    let pageCount = 0;

    while (nextUrl) {
      if (pageCount >= this.listPageLimit) {
        const failure = `The Replicate model list was still paging after ${this.listPageLimit} pages (${allModels.length} models read), so discovery is incomplete.`;
        this.logger.error(`${context} ${failure}`);
        return { failure, models: allModels };
      }

      if (seenUrls.has(nextUrl)) {
        const failure = `The Replicate model list repeated a page cursor after ${pageCount} pages (${allModels.length} models read), so discovery is incomplete.`;
        this.logger.error(`${context} ${failure}`);
        return { failure, models: allModels };
      }
      seenUrls.add(nextUrl);

      if (pageCount > 0 && this.listPageDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.listPageDelayMs),
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      try {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          const failure = `Replicate returned ${response.status} on model list page ${pageCount + 1} (${allModels.length} models read), so discovery is incomplete.`;
          this.logger.error(`${context} ${failure}`);
          return { failure, models: allModels };
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
        const reason =
          (error as Error)?.name === 'AbortError'
            ? 'timed out'
            : 'could not be read';
        const failure = `Replicate model list page ${pageCount + 1} ${reason} (${allModels.length} models read), so discovery is incomplete.`;
        this.logger.error(`${context} ${failure}`, { error });
        return { failure, models: allModels };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return { failure: null, models: allModels };
  }

  /**
   * Draft (when new) and synchronize one Replicate listing row. Never throws;
   * resolves true when the endpoint was synchronized.
   *
   * The model's price page is read first: it decides the category and is the
   * only source of a draft's price. A model whose page is gone is delisted, not
   * failed, and is neither drafted nor synchronized.
   */
  private async syncListedModel(
    modelKey: string,
    listedModel: IReplicateModel,
    existingModels: ReadonlyMap<string, ReplicateSyncModelRecord>,
    summary: IModelDiscoveryRunSummary,
    url: string,
  ): Promise<boolean> {
    // relation-alias-ok: `model` is the Replicate API payload, not a Prisma model.
    let registryModel = existingModels.get(modelKey);
    // A retired row is a closed chapter. Syncing it would only record pending
    // rates and price alerts nobody can act on.
    if (registryModel?.lifecycle === ModelLifecycle.RETIRED) return false;
    try {
      const model = await this.hydrateReplicateSchema(listedModel);
      const billing = await this.modelDiscoveryService.fetchReplicateBilling(
        model.owner,
        model.name,
      );
      if (
        billing.status === 'unavailable' &&
        billing.reason === PAGE_NOT_FOUND
      ) {
        // The API served the model, so only the public page is gone.
        if (registryModel)
          await this.recordDelisted(registryModel, modelKey, model, summary);
        else
          this.logger.log(
            `${url} ${modelKey} has no public price page yet, not drafting it`,
          );
        return false;
      }

      const decision = await this.decideModelCategory(
        model,
        billing.status === 'ok'
          ? replicateBillingMediaFamily(billing.tiers)
          : null,
      );
      const category = decision.category;

      if (!registryModel) {
        const candidate = prepareReplicateModelContract(
          modelKey,
          model,
          category,
          {
            billing,
            pricingType: null,
            source: 'reviewed-registry',
            unitPriceUsd: null,
          },
          summary.timestamp,
        );
        const price = readReplicateDraftPrice(candidate, billing);
        const draft = await this.modelDiscoveryService.createDraftModel(
          this.buildDiscoveryInput(model, modelKey, decision, price),
        );
        if (!draft) return false;
        summary.draftsCreated++;
        registryModel = draft;
        summary.report.newDrafts.push({
          billingUnit: price.billingUnit,
          category,
          modelKey,
          providerCostUsd: price.providerCostUsd,
          sourceUrl: price.sourceUrl,
          unpricedReason: price.unpricedReason,
        });
      }

      const syncResult =
        await this.replicateContractSyncService.synchronizeModel(
          registryModel,
          model,
          category,
          {
            billing,
            pricingType: registryModel.pricingType ?? null,
            source: 'reviewed-registry',
            unitPriceUsd:
              typeof registryModel.providerCostUsd === 'number'
                ? registryModel.providerCostUsd
                : null,
          },
          summary.timestamp,
        );
      this.reportSyncResult(syncResult, registryModel, summary);
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
      return true;
    } catch (error: unknown) {
      summary.errors++;
      if (registryModel?.id) {
        await this.replicateContractSyncService.recordFailure(
          'contract_sync_failed',
          summary.timestamp,
          registryModel.id,
        );
        if (!isQuietRow(registryModel))
          this.reportUnreadable(
            summary,
            modelKey,
            'contract_sync_failed',
            'The Replicate price refresh failed (contract_sync_failed); the last approved rate keeps charging.',
          );
      }
      this.logger.error(`${url} failed to process model ${modelKey}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }

  /**
   * Fetch every registry endpoint the official listing did not carry.
   *
   * Three outcomes are not failures and never alert: a row that names an
   * endpoint Replicate never hosted (a data error), a model the API no longer
   * returns (removed by the provider) and, in `syncListedModel`, one whose price
   * page is gone (delisted). Each is recorded once. A real failure is recorded
   * per model; the alert is one deduped provider-level message when the whole
   * provider is out (nothing listed, or every exact fetch failed), and per model
   * otherwise. Rows nobody can act on stay quiet.
   */
  private async fetchMissingRegistryModels(
    candidates: Map<string, IReplicateModel>,
    existingModels: ReadonlyMap<string, ReplicateSyncModelRecord>,
    listedCount: number,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    const failed: ReplicateSyncModelRecord[] = [];
    let attempted = 0;
    for (const [endpoint, row] of existingModels) {
      if (candidates.has(endpoint)) continue;
      if (row.lifecycle === ModelLifecycle.RETIRED) continue;
      if (Object.hasOwn(PROVIDER_ENDPOINT_DATA_ERRORS, endpoint)) {
        await this.recordDataError(row, endpoint, summary);
        continue;
      }
      // An alias row (FLUX.3 Edit) refreshes from the model Replicate hosts,
      // and a pinned version (`meta/musicgen:671ac…`) is not part of its name.
      const [owner, name] = replicateModelPath(
        resolveFlux3ReplicateEndpoint(endpoint),
      ).split('/');
      if (!owner || !name) {
        summary.errors++;
        continue;
      }
      const fetched = await this.modelDiscoveryService.fetchReplicateModel(
        owner,
        name,
      );
      if (fetched.status === 'ok') {
        attempted++;
        candidates.set(endpoint, fetched.model);
        continue;
      }
      if (fetched.status === 'not_found') {
        await this.recordRemoved(row, endpoint, `${owner}/${name}`, summary);
        continue;
      }
      attempted++;
      summary.errors++;
      failed.push(row);
      await this.replicateContractSyncService.recordFailure(
        'model_fetch_failed',
        summary.timestamp,
        row.id,
      );
    }
    if (failed.length === 0) return;
    const isProviderWide =
      failed.length === attempted ||
      (listedCount === 0 && existingModels.size > 0);
    if (isProviderWide) {
      this.reportUnreadable(
        summary,
        'provider:replicate',
        'model_fetch_failed',
        'The Replicate price refresh failed (model_fetch_failed); the last approved rate keeps charging.',
      );
      return;
    }
    for (const row of failed) {
      if (isQuietRow(row)) continue;
      this.reportUnreadable(
        summary,
        row.key ?? row.endpoint,
        'model_fetch_failed',
        'The Replicate price refresh failed (model_fetch_failed); the last approved rate keeps charging.',
      );
    }
  }

  /** The public price page is gone but the API still serves the model. */
  private async recordDelisted(
    row: ReplicateSyncModelRecord,
    modelKey: string,
    model: IReplicateModel,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    const isNew = await this.replicateContractSyncService.recordProviderState(
      row,
      { code: DELISTED_CODE, status: 'delisted' },
      summary.timestamp,
    );
    if (!isNew || isQuietRow(row)) return;
    summary.report.delisted.push({
      modelKey,
      reason:
        'The public price page returns 404 but the API still serves the model.',
      sourceUrl: `https://replicate.com/${model.owner}/${model.name}`,
    });
  }

  /** The provider's API says the model does not exist. */
  private async recordRemoved(
    row: ReplicateSyncModelRecord,
    modelKey: string,
    modelPath: string,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    const isNew = await this.replicateContractSyncService.recordProviderState(
      row,
      { code: REMOVED_CODE, status: 'removed' },
      summary.timestamp,
    );
    if (!isNew || isQuietRow(row)) return;
    summary.report.removedByProvider.push({
      modelKey,
      reason: 'The Replicate API returns 404 for this model.',
      sourceUrl: `https://replicate.com/${modelPath}`,
    });
  }

  /** The row names an endpoint the provider never hosted. Reported once. */
  private async recordDataError(
    row: ReplicateSyncModelRecord,
    modelKey: string,
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    const isNew = await this.replicateContractSyncService.recordProviderState(
      row,
      { code: DATA_ERROR_CODE, status: 'failed' },
      summary.timestamp,
    );
    if (!isNew) return;
    summary.report.dataErrors.push({
      modelKey,
      reason: PROVIDER_ENDPOINT_DATA_ERRORS[modelKey] ?? DATA_ERROR_CODE,
    });
  }

  /**
   * Post the run's one Discord card. Sends nothing when the run found nothing,
   * and swallows errors: an alert failure must never fail the watcher.
   */
  private async sendScanCard(
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    try {
      await dispatchModelScanCard(this.activityRecorder, summary.report);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} scan card failed`, { error });
    }
  }

  /** Put one refresh failure on the report. */
  private reportUnreadable(
    summary: IModelDiscoveryRunSummary,
    modelKey: string,
    code: string,
    reason: string,
  ): void {
    summary.report.unreadable.push({ code, modelKey, reason });
  }

  /** Put a refresh's outcome on the report. */
  private reportSyncResult(
    result: ReplicateContractSyncResult,
    row: ReplicateSyncModelRecord,
    summary: IModelDiscoveryRunSummary,
  ): void {
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
    }
    if (result.refreshFailure && !isQuietRow(row)) {
      const failure = result.refreshFailure;
      summary.report.unreadable.push({
        code: failure.code,
        modelKey: failure.modelKey,
        reason: failure.reason,
      });
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

  /** The shared discovery input for one Replicate listing row. */
  private buildDiscoveryInput(
    model: IReplicateModel,
    modelKey: string,
    decision: IModelCategoryDecision,
    price: ReplicateDraftPrice,
  ): IModelDiscoveryInput {
    return {
      billingUnit: price.billingUnit,
      category: decision.category,
      description: model.description || '',
      endpoint: modelKey,
      name: model.name,
      owner: model.owner,
      pricingSourceUrl: price.sourceUrl,
      provider: ModelProvider.REPLICATE,
      providerUrl: model.url,
      unpricedReason: price.unpricedReason,
      versionId: model.latest_version?.id ?? null,
      ...(decision.confidence !== undefined
        ? { categoryConfidence: decision.confidence }
        : {}),
      ...(price.providerCostUsd !== null
        ? { providerCostUsd: price.providerCostUsd }
        : {}),
    };
  }

  /**
   * Decide the category for a Replicate model (#4869).
   * The page's billing metric decides first, then the OpenAPI schema from the
   * latest version, then keywords from the description.
   */
  private async decideModelCategory(
    model: IReplicateModel,
    billingFamily: ReplicateBillingMediaFamily | null,
  ): Promise<IModelCategoryDecision> {
    return this.modelDiscoveryService.classifyCategory({
      billingFamily,
      description: model.description,
      endpoint: `${model.owner}/${model.name}`,
      provider: ModelProvider.REPLICATE,
      schema: await this.resolveOpenApiSchema(model),
    });
  }

  /**
   * The model's OpenAPI document: inline when the listing carried it, fetched
   * when only a version id is known, empty when Replicate offers neither.
   */
  private async resolveOpenApiSchema(
    model: IReplicateModel,
  ): Promise<Record<string, unknown>> {
    if (model.latest_version?.id && model.latest_version?.openapi_schema) {
      return model.latest_version.openapi_schema;
    }

    if (model.latest_version?.id) {
      const versionDetail =
        await this.modelDiscoveryService.fetchReplicateSchema(
          model.owner,
          model.name,
          model.latest_version.id,
        );

      if (versionDetail?.openapi_schema) {
        return versionDetail.openapi_schema;
      }
    }

    return {};
  }
}
