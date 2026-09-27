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
 * request that produced it, so every failure — an HTTP/invalid
 * `POSTHOG_HOST`, a non-2xx capture response, or a network error — is
 * caught, logged, and reported to Sentry (genfeedai/genfeed.ai#5314) instead
 * of thrown. Failure reports are bounded to the event name, distinct id, and
 * status code; the project key and event properties are never logged.
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
    // a request (genfeedai/genfeed.ai#5314).
    let host: string;
    let origin: string;
    try {
      host = this.readHost();
      origin = this.assertHttpsOrigin(host);
    } catch (error: unknown) {
      this.reportCaptureFailure(input, error);
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
          signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
        },
        // `allowedSchemes: ['https:']` is defense-in-depth: it also rejects
        // any redirect that would otherwise hop the request to a plaintext
        // origin after the initial HTTPS check above.
        { allowedOrigins: [origin], allowedSchemes: ['https:'] },
      );

      if (!response.ok) {
        this.reportCaptureFailure(
          input,
          new Error(
            `${this.constructorName} received a non-2xx capture response`,
          ),
          response.status,
        );
      }
    } catch (error: unknown) {
      this.reportCaptureFailure(input, error);
    }
  }

  /**
   * Parses the configured PostHog host and rejects anything but an HTTPS
   * origin. Throws for both an HTTP scheme and a malformed URL, so the
   * caller treats "HTTP" and "invalid" configuration the same way: reject
   * the capture without sending it.
   */
  private assertHttpsOrigin(host: string): string {
    const parsed = new URL(host);
    if (parsed.protocol !== 'https:') {
      throw new Error(
        `${this.constructorName} rejected a non-HTTPS POSTHOG_HOST`,
      );
    }
    return parsed.origin;
  }

  /**
   * Records a bounded capture-failure signal (event name, distinct id, and
   * optional status code only) without the PostHog project key or the event
   * payload/properties that were sent.
   */
  private reportCaptureFailure(
    input: IServerFunnelCaptureInput,
    error: unknown,
    status?: number,
  ): void {
    this.logger.warn(`${this.constructorName} capture failed`, {
      distinctId: input.distinctId,
      error: error instanceof Error ? error.message : error,
      event: input.event,
      ...(status === undefined ? {} : { status }),
    });
    Sentry.captureException(error, {
      extra: {
        distinctId: input.distinctId,
        event: input.event,
        ...(status === undefined ? {} : { status }),
      },
    });
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
