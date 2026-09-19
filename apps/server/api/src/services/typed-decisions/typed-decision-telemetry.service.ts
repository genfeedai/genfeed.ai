import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { buildTypedDecisionTelemetryProperties } from '@api/services/typed-decisions/typed-decision-telemetry.util';
import { TYPED_DECISION_TELEMETRY_EVENT } from '@api/services/typed-decisions/typed-decisions.constants';
import type { TypedDecisionTelemetryRecord } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_CAPTURE_TIMEOUT_MS = 800;

/**
 * Records one row per typed decision (#4864): the decision point, the answer
 * and its confidence, the provider, the latency, the rollout mode and — in
 * shadow mode — the deterministic answer it disagreed with. Sibling issues
 * query that agreement before flipping a decision point to live.
 *
 * Vendor spend lands in the same `LlmVendorCost` ledger as LLM spend, so a
 * decision provider's bill is visible next to the models it replaces.
 *
 * Nothing here is on the caller's critical path: `record` returns
 * synchronously and every failure is swallowed at warn level.
 */
@Injectable()
export class TypedDecisionTelemetryService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly ledger: LlmVendorCostLedgerService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  record(record: TypedDecisionTelemetryRecord): void {
    void this.persist(record).catch((error: unknown) => {
      this.logger.warn(`${this.constructorName} failed to record decision`, {
        decisionPoint: record.decisionPoint,
        error,
      });
    });
  }

  private async persist(record: TypedDecisionTelemetryRecord): Promise<void> {
    await this.recordVendorCost(record);
    await this.capturePostHog(record);
  }

  /**
   * Only a call that reached the vendor has usage, and the ledger is
   * tenant-scoped — an unattributed decision is telemetry, not spend.
   */
  private async recordVendorCost(
    record: TypedDecisionTelemetryRecord,
  ): Promise<void> {
    const { organizationId, usage } = record;
    if (!organizationId || !usage) {
      return;
    }

    await this.ledger.record({
      brandId: record.brandId,
      completionTokens: usage.outputTokens,
      costEvidence:
        usage.vendorCostMicros === undefined ? 'unknown' : 'observed',
      isByok: false,
      latencyMs: record.latencyMs,
      model: usage.model,
      organizationId,
      promptTokens: usage.inputTokens,
      provider: record.provider,
      runId: record.runId,
      threadId: record.threadId,
      vendorCostMicros: usage.vendorCostMicros ?? 0,
    });
  }

  private async capturePostHog(
    record: TypedDecisionTelemetryRecord,
  ): Promise<void> {
    const projectKey = this.readProjectKey();
    if (!projectKey) {
      return;
    }

    const host = this.readHost();
    const origin = new URL(host).origin;

    await safeFetch(
      `${host}/i/v0/e/`,
      {
        body: JSON.stringify({
          api_key: projectKey,
          distinct_id: record.userId || record.organizationId || 'anonymous',
          event: TYPED_DECISION_TELEMETRY_EVENT,
          properties: buildTypedDecisionTelemetryProperties(record),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(POSTHOG_CAPTURE_TIMEOUT_MS),
      },
      { allowedOrigins: [origin] },
    );
  }

  private readProjectKey(): string {
    return String(
      this.configService.get('POSTHOG_PROJECT_API_KEY') || '',
    ).trim();
  }

  private readHost(): string {
    const configured = String(
      this.configService.get('POSTHOG_HOST') || DEFAULT_POSTHOG_HOST,
    ).trim();

    return configured.replace(/\/$/, '') || DEFAULT_POSTHOG_HOST;
  }
}
