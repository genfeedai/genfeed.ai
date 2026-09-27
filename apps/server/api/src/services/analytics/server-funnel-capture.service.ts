import { ONBOARDING_COMPLETED_EVENT } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const CAPTURE_TIMEOUT_MS = 800;

export interface IServerFunnelCaptureInput {
  event: string;
  /** PostHog distinct id — the user or organization this funnel step belongs to. */
  distinctId: string;
  properties?: Record<string, unknown>;
}

/**
 * Server-side PostHog `capture` for funnel events that only complete on a
 * backend surface an operator or client SDK never touches
 * (genfeedai/genfeed.ai#4969: `onboarding_completed` for agent-first
 * onboarding, `first_successful_publish` for social). Mirrors the same
 * `/i/v0/e/` HTTP capture call `LlmCompletionTelemetryService` already makes
 * for LLM generation telemetry — no new PostHog project, client, or SDK.
 *
 * Best-effort by design: a dropped analytics event must never fail the
 * request that produced it, so every failure is caught, logged, and reported
 * to Sentry instead of thrown.
 */
@Injectable()
export class ServerFunnelCaptureService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async capture(input: IServerFunnelCaptureInput): Promise<void> {
    const projectKey = this.readProjectKey();
    if (!projectKey || !input.distinctId) {
      return;
    }

    try {
      const host = this.readHost();
      const origin = new URL(host).origin;

      await safeFetch(
        `${host}/i/v0/e/`,
        {
          body: JSON.stringify({
            api_key: projectKey,
            distinct_id: input.distinctId,
            event: input.event,
            properties: input.properties ?? {},
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
        },
        { allowedOrigins: [origin] },
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} capture failed`, {
        distinctId: input.distinctId,
        error: error instanceof Error ? error.message : error,
        event: input.event,
      });
      Sentry.captureException(error, {
        extra: { distinctId: input.distinctId, event: input.event },
      });
    }
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

/**
 * Single emission point for the `onboarding_completed` funnel event
 * (genfeedai/genfeed.ai#4969, #5311). Every onboarding-completion surface —
 * agent-first (`OnboardingCreditGrantsService#captureOnboardingCompletedBestEffort`)
 * and the classic wizard (`UsersController#completeOnboardingFunnel`) —
 * calls this same function instead of posting to PostHog independently, so
 * there is exactly one place that can ever fire this event. Callers pass the
 * `modifiedCount` result of their own atomic `isOnboardingCompleted: false`
 * claim as the gate: only the caller that actually won the false->true
 * transition should invoke this. `UsersController` cannot inject
 * `OnboardingCreditGrantsService` directly without importing `CreditsModule`
 * into `UsersModule`, which risks the same circular dependency
 * `UserSetupModule` was split out to avoid — so both callers depend on this
 * leaf-level function instead.
 */
export function captureOnboardingCompletedBestEffort(
  funnelCaptureService: ServerFunnelCaptureService | undefined,
  userId: string,
): void {
  if (!funnelCaptureService) {
    return;
  }

  void funnelCaptureService.capture({
    distinctId: userId,
    event: ONBOARDING_COMPLETED_EVENT,
  });
}
