import type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';
import { isSaaS } from '@genfeedai/config/deployment';
import { PLATFORM_FEATURE_FLAG_DISTINCT_ID } from '@genfeedai/contracts/constants';
import type { IPlatformFeatureFlagResult } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_PROJECT_KEY_PATTERN = /^phc_[A-Za-z0-9]+$/;
const EVALUATE_TIMEOUT_MS = 800;

interface PostHogFlagDetail {
  enabled?: unknown;
  failed?: unknown;
  metadata?: { payload?: unknown };
  variant?: unknown;
}

interface PostHogFlagsResponse {
  errorsWhileComputingFlags?: unknown;
  featureFlagPayloads?: Record<string, unknown>;
  featureFlags?: Record<string, unknown>;
  flags?: Record<string, PostHogFlagDetail | undefined>;
  quotaLimited?: unknown;
}

type PostHogFlagResults = Record<string, IPlatformFeatureFlagResult>;

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
    const distinctId = readDistinctId(attributes);
    if (!distinctId) {
      return undefined;
    }

    const isInternal = attributes?.is_internal;
    const flags = await this.evaluateFlags(
      distinctId,
      typeof isInternal === 'boolean' ? { is_internal: isInternal } : {},
      flagKey,
    );
    return flags?.[flagKey]?.enabled;
  }

  /**
   * Every flag for the fixed platform identity (#5468), with its variant and
   * payload. `undefined` when PostHog is not configured or did not answer —
   * callers decide the fallback.
   */
  evaluatePlatformFlags(): Promise<PostHogFlagResults | undefined> {
    return this.evaluateFlags(
      PLATFORM_FEATURE_FLAG_DISTINCT_ID,
      {},
      'platform',
    );
  }

  private async evaluateFlags(
    distinctId: string,
    personProperties: Record<string, unknown>,
    context: string,
  ): Promise<PostHogFlagResults | undefined> {
    if (!this.isConfigured()) {
      return undefined;
    }

    const host = this.getHost();
    const origin = new URL(host).origin;

    try {
      const response = await safeFetch(
        `${host}/flags?v=2`,
        {
          body: JSON.stringify({
            distinct_id: distinctId,
            person_properties: personProperties,
            token: this.getProjectKey(),
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
          flagKey: context,
          status: response.status,
        });
        return undefined;
      }

      const payload = (await response.json()) as PostHogFlagsResponse;
      if (isFailedEvaluation(payload)) {
        this.loggerService.warn('PostHog could not compute feature flags', {
          flagKey: context,
        });
        return undefined;
      }

      return readFlagResults(payload);
    } catch (error) {
      this.loggerService.warn('PostHog feature flag evaluation failed', {
        error,
        flagKey: context,
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

/**
 * A 200 that is not an answer: PostHog hit an error computing some flags, is
 * quota-limiting flag evaluation, or marks a flag as failed. Treating it as an
 * empty answer would silently reset every missing flag to its default.
 */
function isFailedEvaluation(payload: PostHogFlagsResponse): boolean {
  if (payload.errorsWhileComputingFlags === true) {
    return true;
  }
  if (
    Array.isArray(payload.quotaLimited) &&
    payload.quotaLimited.includes('feature_flags')
  ) {
    return true;
  }
  return Object.values(payload.flags ?? {}).some(
    (detail) => detail?.failed === true,
  );
}

/**
 * Normalise both `/flags` response shapes: v2 `flags[key]` with `enabled`,
 * `variant` and `metadata.payload`, and the legacy `featureFlags` map (a
 * boolean or a variant string) with `featureFlagPayloads`.
 */
function readFlagResults(payload: PostHogFlagsResponse): PostHogFlagResults {
  const results: PostHogFlagResults = {};

  for (const [key, value] of Object.entries(payload.featureFlags ?? {})) {
    if (typeof value === 'boolean' || typeof value === 'string') {
      results[key] = {
        enabled: value !== false,
        payload: payload.featureFlagPayloads?.[key],
        variant: typeof value === 'string' ? value : null,
      };
    }
  }

  for (const [key, detail] of Object.entries(payload.flags ?? {})) {
    if (typeof detail?.enabled === 'boolean') {
      results[key] = {
        enabled: detail.enabled,
        payload: detail.metadata?.payload,
        variant: typeof detail.variant === 'string' ? detail.variant : null,
      };
    }
  }

  return results;
}
