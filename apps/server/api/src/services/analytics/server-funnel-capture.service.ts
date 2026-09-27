import {
  FIRST_SUCCESSFUL_PUBLISH_EVENT,
  ONBOARDING_COMPLETED_EVENT,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const CAPTURE_TIMEOUT_MS = 800;

/**
 * The complete, closed set of server-side funnel event names
 * (genfeedai/genfeed.ai#4969). Not `string`: every call site must pass one
 * of these two named constants, so `event` can never carry arbitrary or
 * user-derived text into a log or Sentry report.
 */
type ServerFunnelEventName =
  | typeof ONBOARDING_COMPLETED_EVENT
  | typeof FIRST_SUCCESSFUL_PUBLISH_EVENT;

export interface IServerFunnelCaptureInput {
  event: ServerFunnelEventName;
  /** PostHog distinct id — the user or organization this funnel step belongs to. */
  distinctId: string;
  properties?: Record<string, unknown>;
}

/**
 * Bounded capture-failure categories. Never derived from an exception's
 * message or from response content — see `reportCaptureFailure`.
 */
type CaptureFailureCategory =
  | 'invalid_destination'
  | 'non_2xx_response'
  | 'request_failed';

/**
 * Server-side PostHog `capture` for funnel events that only complete on a
 * backend surface an operator or client SDK never touches
 * (genfeedai/genfeed.ai#4969: `onboarding_completed` for agent-first
 * onboarding, `first_successful_publish` for social). Mirrors the same
 * `/i/v0/e/` HTTP capture call `LlmCompletionTelemetryService` already makes
 * for LLM generation telemetry — no new PostHog project, client, or SDK.
 *
 * Best-effort by design: a dropped analytics event must never fail the
 * request that produced it, so every failure — an HTTP/invalid
 * `POSTHOG_HOST`, a 3xx/non-2xx capture response, or a network error — is
 * caught and reported to the logger + Sentry (genfeedai/genfeed.ai#5314)
 * instead of thrown. Failure reports are bounded to a fixed category, the
 * closed-set event name, and an optional status code: the original
 * exception (and its message, which can embed request/redirect data such as
 * an echoed `Location` header) is deliberately never logged or attached,
 * and neither is the distinct id (a user/organization identifier), the
 * project key, or event properties.
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

    // Validate the configured destination before ever calling safeFetch: an
    // HTTP or malformed POSTHOG_HOST must reject the capture without sending
    // a request (genfeedai/genfeed.ai#5314). Validation runs on the
    // configured value exactly as returned by readHost() — before any
    // trailing-slash normalization — so an explicitly configured value that
    // is not a valid HTTPS URL (e.g. "/" or whitespace) is rejected rather
    // than silently normalized down to the public default.
    let host: string;
    let origin: string;
    try {
      const configuredHost = this.readHost();
      origin = this.assertHttpsOrigin(configuredHost);
      host = this.stripTrailingSlash(configuredHost);
    } catch {
      this.reportCaptureFailure(input.event, 'invalid_destination');
      return;
    }

    try {
      const response = await safeFetch(
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
          // A same-origin redirect could turn this POST into a bodyless GET
          // that still returns 2xx without ever recording the event, and a
          // followed redirect Location can itself carry echoed request data.
          // Never follow: any 3xx response is treated as a failure below.
          redirect: 'manual',
          signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
        },
        // `allowedSchemes: ['https:']` is defense-in-depth: it also rejects
        // any redirect target that would otherwise hop to a plaintext
        // origin after the initial HTTPS check above.
        { allowedOrigins: [origin], allowedSchemes: ['https:'] },
      );

      if (!response.ok) {
        this.reportCaptureFailure(
          input.event,
          'non_2xx_response',
          response.status,
        );
      }
    } catch {
      this.reportCaptureFailure(input.event, 'request_failed');
    }
  }

  /**
   * Parses the configured PostHog host and rejects anything but an HTTPS
   * origin. Throws for both an HTTP scheme and a malformed URL (including an
   * empty or whitespace-only explicit value), so the caller treats "HTTP"
   * and "invalid" configuration the same way: reject the capture without
   * sending it.
   */
  private assertHttpsOrigin(host: string): string {
    const parsed = new URL(host);
    if (parsed.protocol !== 'https:') {
      throw new Error('non-HTTPS POSTHOG_HOST');
    }
    return parsed.origin;
  }

  private stripTrailingSlash(host: string): string {
    return host.endsWith('/') ? host.slice(0, -1) : host;
  }

  /**
   * Records a bounded capture-failure signal: a fixed category, the
   * closed-set event name, and an optional status code. Never accepts or
   * forwards the original exception — its message can embed request or
   * redirect details (e.g. destination-guard's redirect error embeds the
   * target `Location`) — and never the distinct id (a user/organization
   * identifier), the PostHog project key, or event payload/properties.
   */
  private reportCaptureFailure(
    event: ServerFunnelEventName,
    category: CaptureFailureCategory,
    status?: number,
  ): void {
    const context = {
      category,
      event,
      ...(status === undefined ? {} : { status }),
    };
    this.logger.warn(`${this.constructorName} capture failed`, context);
    Sentry.captureException(
      new Error(`${this.constructorName} capture failed: ${category}`),
      { extra: context },
    );
  }

  private readProjectKey(): string {
    return String(
      this.configService.get('POSTHOG_PROJECT_API_KEY') || '',
    ).trim();
  }

  /**
   * Returns the configured PostHog host as-is (trimmed), or the public
   * default when the config is genuinely absent or empty. Any other
   * explicitly configured value — including one that is only whitespace, or
   * that normalizes to nothing — is returned unchanged so `assertHttpsOrigin`
   * validates and rejects it instead of this method silently substituting
   * the default.
   */
  private readHost(): string {
    const raw = this.configService.get('POSTHOG_HOST');
    if (raw === undefined || raw === null || raw === '') {
      return DEFAULT_POSTHOG_HOST;
    }
    return String(raw).trim();
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
