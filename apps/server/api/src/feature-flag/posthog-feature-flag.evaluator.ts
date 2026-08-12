import type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';
import { isSaaS } from '@genfeedai/config/deployment';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_PROJECT_KEY_PATTERN = /^phc_[A-Za-z0-9]+$/;
const EVALUATE_TIMEOUT_MS = 800;

interface PostHogFlagPayload {
  enabled?: unknown;
}

interface PostHogFlagsResponse {
  featureFlags?: Record<string, unknown>;
  flags?: Record<string, PostHogFlagPayload | undefined>;
}

@Injectable()
export class PostHogFeatureFlagEvaluator {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  isConfigured(): boolean {
    return isSaaS() && POSTHOG_PROJECT_KEY_PATTERN.test(this.getProjectKey());
  }

  async isEnabled(
    flagKey: string,
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }

    const distinctId = readDistinctId(attributes);
    if (!distinctId) {
      return undefined;
    }

    const host = this.getHost();
    const projectKey = this.getProjectKey();
    const origin = new URL(host).origin;
    const isInternal = attributes?.is_internal;

    try {
      const response = await safeFetch(
        `${host}/flags?v=2`,
        {
          body: JSON.stringify({
            distinct_id: distinctId,
            person_properties:
              typeof isInternal === 'boolean'
                ? { is_internal: isInternal }
                : {},
            token: projectKey,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(EVALUATE_TIMEOUT_MS),
        },
        {
          allowedOrigins: [origin],
        },
      );

      if (!response.ok) {
        this.loggerService.warn('PostHog feature flag request failed', {
          flagKey,
          status: response.status,
        });
        return undefined;
      }

      const payload = (await response.json()) as PostHogFlagsResponse;
      return readFlagEnabled(payload, flagKey);
    } catch (error) {
      this.loggerService.warn('PostHog feature flag evaluation failed', {
        error,
        flagKey,
      });
      return undefined;
    }
  }

  private getProjectKey(): string {
    return String(
      this.configService.get('POSTHOG_PROJECT_API_KEY') ||
        this.configService.get('NEXT_PUBLIC_POSTHOG_KEY') ||
        '',
    ).trim();
  }

  private getHost(): string {
    const configured = String(
      this.configService.get('POSTHOG_HOST') ||
        this.configService.get('NEXT_PUBLIC_POSTHOG_HOST') ||
        DEFAULT_POSTHOG_HOST,
    ).trim();

    return configured.replace(/\/$/, '') || DEFAULT_POSTHOG_HOST;
  }
}

function readDistinctId(
  attributes?: FeatureFlagAttributes,
): string | undefined {
  const id = attributes?.id;
  return typeof id === 'string' && id.trim() !== '' ? id : undefined;
}

function readFlagEnabled(
  payload: PostHogFlagsResponse,
  flagKey: string,
): boolean | undefined {
  const detailed = payload.flags?.[flagKey]?.enabled;
  if (typeof detailed === 'boolean') {
    return detailed;
  }

  const legacy = payload.featureFlags?.[flagKey];
  if (typeof legacy === 'boolean') {
    return legacy;
  }

  return undefined;
}
