import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import {
  PaidCreativeResearchIngestionService,
  type WatchedAdvertiserScope,
} from '@api/services/paid-creative-research/services/paid-creative-research-ingestion.service';
import { Injectable } from '@nestjs/common';

type PaidCreativeResearchAction = typeof AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE;

export interface PaidCreativeResearchWorkflowResult {
  action: PaidCreativeResearchAction;
  advertisersChecked: number;
  errors: number;
  organizationId: string;
  reason?: string;
  recordsIngested: number;
  skipped: number;
  status: 'completed' | 'skipped';
}

/**
 * Scheduled competitor paid-creative research across every ad platform
 * (#3537, generalizing the X-only node from #3395).
 *
 * The run is attempted whenever at least one provider adapter reports ready —
 * today Meta Ad Library and TikTok Creative Center via Apify. When no adapter
 * is ready the node skips with the first blocker as the reason instead of
 * writing an empty snapshot, so "we could not look" never reads downstream as
 * "the competitor is running no ads".
 */
@Injectable()
export class PaidCreativeResearchWorkflowService {
  constructor(
    private readonly paidCreativeResearchIngestionService: PaidCreativeResearchIngestionService,
  ) {}

  preparePaidCreativeResearch(organizationId: string): Record<string, unknown> {
    const readiness = this.paidCreativeResearchIngestionService.getReadiness();
    const availablePlatforms = readiness.filter((entry) => entry.available);
    return {
      available: availablePlatforms.length > 0,
      organizationId,
      ...(availablePlatforms.length === 0
        ? {
            reason:
              readiness.flatMap((entry) => entry.blockers)[0] ??
              'paid_creative_source_unavailable',
          }
        : {}),
    };
  }

  async discoverPaidCreativeAdvertisers(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).available !== true)
      return { baseInput: { organizationId }, items: [] };
    const items =
      await this.paidCreativeResearchIngestionService.discoverAdvertisers(
        organizationId,
      );
    return { baseInput: { organizationId }, items };
  }

  async ingestPaidCreativeAdvertiser(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const advertiser = this.readRecord(input.item) as WatchedAdvertiserScope;
    const result = await this.paidCreativeResearchIngestionService.ingestOne(
      organizationId,
      advertiser,
      {},
    );
    return { ...result };
  }

  finalizePaidCreativeResearch(
    organizationId: string,
    input: Record<string, unknown>,
  ): PaidCreativeResearchWorkflowResult {
    const state = this.readRecord(input.state);
    if (state.available !== true) {
      return {
        action: AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE,
        advertisersChecked: 0,
        errors: 0,
        organizationId,
        reason:
          typeof state.reason === 'string'
            ? state.reason
            : 'paid_creative_source_unavailable',
        recordsIngested: 0,
        skipped: 1,
        status: 'skipped',
      };
    }
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );

    return {
      action: AUTOMATION_WORKFLOW_IDS.PAID_CREATIVE,
      advertisersChecked: results.length,
      errors: results.filter((result) => result.status === 'error').length,
      organizationId,
      recordsIngested: results.reduce(
        (total, result) =>
          total +
          (typeof result.recordCount === 'number' ? result.recordCount : 0),
        0,
      ),
      skipped: results.filter((result) => result.status === 'unavailable')
        .length,
      status: 'completed',
    };
  }

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
