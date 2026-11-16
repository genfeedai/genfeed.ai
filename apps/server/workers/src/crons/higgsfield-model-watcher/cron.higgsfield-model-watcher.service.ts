import { ModelsService } from '@api/collections/models/services/models.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { HiggsfieldDocsCatalogClient } from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.client';
import {
  HIGGSFIELD_CATALOG_URL,
  type HiggsfieldCatalogEntry,
} from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.util';
import type { IModelDiscoveryRunSummary } from '@workers/interfaces/model-discovery.interface';
import { ModelDiscoveryService } from '@workers/services/model-discovery.service';
import { dispatchModelScanCard } from '@workers/services/model-pricing-alerts.util';
import {
  createModelDiscoveryRunSummary,
  finalizeModelScanReport,
} from '@workers/services/model-scan-report.util';

/**
 * The docs catalog lists 84 entries. A read far below that means the docs
 * were unreachable or restructured, so no row may be called removed from it.
 */
export const HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE = 40;

/** Sync failure code of a row the docs catalog no longer lists. Reported once. */
export const NOT_IN_CATALOG_CODE = 'removed_by_provider:not_in_docs_catalog';

/**
 * Endpoint the docs say still answers but is hidden from discovery
 * ("higgsfiled" is a typo in the provider's earlier docs).
 */
const LEGACY_ENDPOINT_PATTERN = /^higgsfiled\//;

const UNPRICED_REASON =
  'Higgsfield publishes no per-endpoint list price in its docs. The price comes from its estimate endpoint, which has not been sampled for this model yet.';

interface HiggsfieldRegistryRow {
  endpoint: string;
  id: string;
  isActive: boolean;
  key: string;
  lifecycle: string | null;
  providerSyncFailureCode: string | null;
}

@Injectable()
export class CronHiggsfieldModelWatcherService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly modelDiscoveryService: ModelDiscoveryService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly catalogClient: HiggsfieldDocsCatalogClient,
  ) {}

  /**
   * Weekly Higgsfield catalog scan. Drafts every endpoint the public docs list
   * that the registry does not have (inactive, review pending, no price), and
   * reports registry rows the docs no longer list. It never activates, prices
   * or retires a row: an operator does that from the report.
   */
  async discoverModels(): Promise<IModelDiscoveryRunSummary> {
    const summary = await this.scanCatalog();
    await this.sendScanCard(summary);
    return summary;
  }

  private async scanCatalog(): Promise<IModelDiscoveryRunSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    const summary = createModelDiscoveryRunSummary('higgsfield');

    try {
      const snapshot = await this.catalogClient.fetchCatalog();
      summary.totalPolled = snapshot.entries.length;

      if (snapshot.entries.length < HIGGSFIELD_MIN_PLAUSIBLE_CATALOG_SIZE) {
        summary.errors++;
        summary.report.unreadable.push({
          code: 'catalog_unreadable',
          modelKey: 'provider:higgsfield',
          reason: `The Higgsfield docs catalog returned ${snapshot.entries.length} endpoints (${snapshot.failedUrls.length} pages failed); nothing was drafted or reported as removed.`,
        });
        finalizeModelScanReport(summary);
        return summary;
      }

      const registryRows = await this.loadRegistryRows();
      const known = new Set<string>();
      for (const row of registryRows) {
        known.add(row.endpoint);
        known.add(row.key);
      }

      for (const entry of snapshot.entries) {
        if (known.has(entry.endpoint)) continue;
        await this.draftEntry(entry, summary, url);
      }

      // A partial read cannot prove a row was removed.
      if (snapshot.failedUrls.length === 0) {
        await this.reportRemovedRows(registryRows, snapshot.entries, summary);
      }

      finalizeModelScanReport(summary);
      this.logger.log(`${url} completed`, {
        draftsCreated: summary.draftsCreated,
        errors: summary.errors,
        totalPolled: summary.totalPolled,
      });
      return summary;
    } catch (error: unknown) {
      summary.errors++;
      summary.report.unreadable.push({
        code: 'higgsfield_sync_failed',
        modelKey: 'provider:higgsfield',
        reason: 'The Higgsfield catalog scan failed before it finished.',
      });
      finalizeModelScanReport(summary);
      this.logger.error(`${url} failed`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return summary;
    }
  }

  private async loadRegistryRows(): Promise<HiggsfieldRegistryRow[]> {
    const rows = await this.modelsService.prisma.model.findMany({
      select: {
        endpoint: true,
        id: true,
        isActive: true,
        key: true,
        lifecycle: true,
        providerSyncFailureCode: true,
      },
      where: {
        isDeleted: false,
        organizationId: null,
        provider: ModelProvider.HIGGSFIELD,
      },
    });
    return rows.filter((row) => row.lifecycle !== ModelLifecycle.RETIRED);
  }

  private async draftEntry(
    entry: HiggsfieldCatalogEntry,
    summary: IModelDiscoveryRunSummary,
    url: string,
  ): Promise<void> {
    summary.newModelsFound++;
    try {
      const draft = await this.modelDiscoveryService.createDraftModel({
        category: entry.category,
        description: `Higgsfield ${entry.label}. Discovered from the Higgsfield docs catalog; pending manual review.`,
        endpoint: entry.endpoint,
        label: entry.label,
        name: entry.endpoint.split('/').slice(1).join('/') || entry.endpoint,
        owner: entry.endpoint.split('/')[0] ?? 'higgsfield',
        pricingSourceUrl: null,
        provider: ModelProvider.HIGGSFIELD,
        providerUrl: entry.sourceUrl,
        unpricedReason: UNPRICED_REASON,
        versionId: null,
      });
      if (!draft) return;
      summary.draftsCreated++;
      summary.report.newDrafts.push({
        billingUnit: null,
        category: entry.category,
        modelKey: draft.key,
        providerCostUsd: null,
        sourceUrl: entry.sourceUrl,
        unpricedReason: UNPRICED_REASON,
      });
    } catch (error: unknown) {
      summary.errors++;
      this.logger.error(`${url} failed to draft ${entry.endpoint}`, {
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /**
   * Registry rows the docs catalog no longer lists. Inactive rows and the
   * legacy endpoint spelling stay quiet, and each row is reported once.
   */
  private async reportRemovedRows(
    rows: readonly HiggsfieldRegistryRow[],
    entries: readonly HiggsfieldCatalogEntry[],
    summary: IModelDiscoveryRunSummary,
  ): Promise<void> {
    const listed = new Set(entries.map((entry) => entry.endpoint));
    for (const row of rows) {
      const endpoint = row.endpoint || row.key;
      if (listed.has(endpoint) || listed.has(row.key)) continue;
      if (!row.isActive || LEGACY_ENDPOINT_PATTERN.test(endpoint)) continue;
      if (row.providerSyncFailureCode === NOT_IN_CATALOG_CODE) continue;

      await this.modelsService.prisma.model.updateMany({
        data: {
          providerSyncFailedAt: summary.timestamp,
          providerSyncFailureCode: NOT_IN_CATALOG_CODE,
          providerSyncStatus: 'failed',
        },
        where: {
          id: row.id,
          isDeleted: false,
          organizationId: null,
          provider: ModelProvider.HIGGSFIELD,
        },
      });
      summary.report.removedByProvider.push({
        modelKey: row.key,
        reason: `Not listed in the Higgsfield docs catalog on ${summary.timestamp.toISOString().slice(0, 10)}. The docs do not say it was removed; a call with a key shows whether the endpoint still answers.`,
        sourceUrl: HIGGSFIELD_CATALOG_URL,
      });
    }
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
}
