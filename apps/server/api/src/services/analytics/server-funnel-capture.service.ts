import {
  type PostHogCaptureFailureCategory,
  sendPostHogCapture,
} from '@api/services/analytics/posthog-capture.util';
import {
  FIRST_SUCCESSFUL_GENERATION_EVENT,
  FIRST_SUCCESSFUL_PUBLISH_EVENT,
  GENERATION_COMPLETED_EVENT,
  ONBOARDING_COMPLETED_EVENT,
  POST_PUBLISHED_EVENT,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * The complete, closed set of server-side funnel event names
 * (genfeedai/genfeed.ai#4969). Not `string`: every call site must pass one
 * of these named constants, so `event` can never carry arbitrary or
 * user-derived text into a log or Sentry report.
 */
type ServerFunnelEventName =
  | typeof ONBOARDING_COMPLETED_EVENT
  | typeof FIRST_SUCCESSFUL_PUBLISH_EVENT
  | typeof FIRST_SUCCESSFUL_GENERATION_EVENT
  | typeof GENERATION_COMPLETED_EVENT
  | typeof POST_PUBLISHED_EVENT;

export interface IServerFunnelCaptureInput {
  event: ServerFunnelEventName;
  /** PostHog distinct id — the user or organization this funnel step belongs to. */
  distinctId: string;
  /**
   * Owning organization. When it is listed in `POSTHOG_INTERNAL_ORGANIZATION_IDS` the
   * capture also sets the person property `is_internal: true`, so the same
   * person-level filter that drops `@genfeed.ai` accounts drops internal orgs.
   */
  organizationId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Server-side PostHog `capture` for funnel events that only complete on a
 * backend surface an operator or client SDK never touches
 * (genfeedai/genfeed.ai#4969: `onboarding_completed` for agent-first
 * onboarding, `first_successful_publish` for social). Sends through
 * `sendPostHogCapture`, the one `/i/v0/e/` capture call the LLM and
 * typed-decision telemetry share — no new PostHog project, client, or SDK.
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
@Traced()
@Injectable()
export class ServerFunnelCaptureService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async capture(input: IServerFunnelCaptureInput): Promise<void> {
    const result = await sendPostHogCapture(this.configService, {
      distinctId: input.distinctId,
      event: input.event,
      properties: this.withInternalFlag(input),
    });

    if (result.status === 'failed') {
      this.reportCaptureFailure(
        input.event,
        result.category,
        result.httpStatus,
      );
    }
  }

  /**
   * Adds `$set: { is_internal: true }` for internal organizations. The browser
   * identify only knows the email domain and sends `is_internal: false` via
   * `$set_once`, so a server-set `true` is never overwritten.
   */
  private withInternalFlag(
    input: IServerFunnelCaptureInput,
  ): Record<string, unknown> {
    const properties = input.properties ?? {};
    if (
      !(
        input.organizationId &&
        this.isInternalOrganization(input.organizationId)
      )
    ) {
      return properties;
    }

    return {
      ...properties,
      $set: {
        ...(typeof properties.$set === 'object' && properties.$set !== null
          ? properties.$set
          : {}),
        is_internal: true,
      },
    };
  }

  private isInternalOrganization(organizationId: string): boolean {
    return String(
      this.configService.get('POSTHOG_INTERNAL_ORGANIZATION_IDS') || '',
    )
      .split(',')
      .map((id) => id.trim())
      .includes(organizationId);
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
    category: PostHogCaptureFailureCategory,
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
  organizationId?: string,
): void {
  if (!funnelCaptureService) {
    return;
  }

  void funnelCaptureService.capture({
    distinctId: userId,
    event: ONBOARDING_COMPLETED_EVENT,
    organizationId,
  });
}
