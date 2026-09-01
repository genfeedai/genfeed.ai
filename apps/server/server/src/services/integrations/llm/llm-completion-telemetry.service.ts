import {
  computeLlmCompletionCostUsd,
  computeLlmPromptCostUsd,
  computeLlmVendorCostMicros,
  LLM_GENERATION_TELEMETRY_EVENT,
} from '@genfeedai/constants';
import type {
  ILlmCompletionTelemetryEvent,
  ILlmGenerationTelemetryCosts,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';
import { buildLlmGenerationTelemetryProperties } from '@server/services/integrations/llm/llm-generation-telemetry';
import { LlmVendorCostLedgerService } from '@server/services/integrations/llm/llm-vendor-cost-ledger.service';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_CAPTURE_TIMEOUT_MS = 800;

@Injectable()
export class LlmCompletionTelemetryService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly ledger: LlmVendorCostLedgerService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async recordCompletion(event: ILlmCompletionTelemetryEvent): Promise<void> {
    const costInput = {
      completionTokens: event.completionTokens,
      isByok: event.isByok,
      model: event.model,
      promptTokens: event.promptTokens,
    };
    const vendorCostMicros =
      event.vendorCostMicros ?? computeLlmVendorCostMicros(costInput);
    const costs = {
      inputCostUsd: computeLlmPromptCostUsd(costInput),
      outputCostUsd: computeLlmCompletionCostUsd(costInput),
      vendorCostMicros,
    };

    if (event.organizationId) {
      try {
        await this.ledger.record({
          brandId: event.brandId,
          completionTokens: event.completionTokens,
          isByok: event.isByok,
          latencyMs: event.latencyMs,
          model: event.model,
          organizationId: event.organizationId,
          promptTokens: event.promptTokens,
          provider: event.provider,
          runId: event.runId,
          threadId: event.threadId,
          vendorCostMicros,
        });
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to persist vendor cost`,
          error,
        );
      }
    }

    void this.capturePostHog(event, costs).catch((error: unknown) => {
      this.logger.warn(`${this.constructorName} PostHog capture failed`, {
        error,
      });
    });
  }

  private async capturePostHog(
    event: ILlmCompletionTelemetryEvent,
    costs: ILlmGenerationTelemetryCosts,
  ): Promise<void> {
    const projectKey = this.readProjectKey();
    if (!projectKey) {
      return;
    }

    const host = this.readHost();
    const origin = new URL(host).origin;
    const properties = buildLlmGenerationTelemetryProperties(event, costs);

    await safeFetch(
      `${host}/i/v0/e/`,
      {
        body: JSON.stringify({
          api_key: projectKey,
          distinct_id: event.userId || event.organizationId || 'anonymous',
          event: LLM_GENERATION_TELEMETRY_EVENT,
          properties,
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
