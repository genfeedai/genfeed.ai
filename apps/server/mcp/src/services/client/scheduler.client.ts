import type {
  IPublishingProviderReadiness,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { BaseApiClient } from './base-api-client';

export type ScheduledReleaseControlAction =
  | 'cancel'
  | 'pause'
  | 'publish-now'
  | 'resume';

export interface SchedulerCapabilityListOptions {
  includeHidden?: boolean;
  includePlanned?: boolean;
}

export interface ValidateSchedulerTargetInput {
  caption?: string;
  credentialId?: string;
  media?: Array<Record<string, unknown>>;
  platform: string;
  publishMode?: string;
  settings?: Record<string, unknown>;
  visibility?: string;
}

/**
 * Scheduler release lifecycle, channel-capability, and brand-readiness proxy.
 * The MCP layer forwards canonical scheduler requests unchanged; validation,
 * organization scope, state transitions, idempotency, credential diagnostics,
 * and publishing rules remain API-owned.
 */
export class SchedulerClient {
  constructor(private readonly base: BaseApiClient) {}

  createScheduledRelease(
    release: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<IReleaseGroup> {
    this.base.logger.debug('Creating scheduled release');

    return this.base.request(
      'creating scheduled release',
      async (http) => {
        const response = await http.post('/post-groups', release, {
          ...(idempotencyKey
            ? { headers: { 'idempotency-key': idempotencyKey } }
            : {}),
        });
        return this.base.unwrapObject<IReleaseGroup>(response);
      },
      this.base.failWithDetail('Failed to create scheduled release'),
    );
  }

  getScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
    this.base.logger.debug(`Getting scheduled release: ${releaseId}`);

    return this.base.request(
      'getting scheduled release',
      async (http) => {
        const response = await http.get(
          `/post-groups/${encodeURIComponent(releaseId)}`,
        );
        return this.base.unwrapObject<IReleaseGroup>(response);
      },
      this.base.failWithDetail('Failed to get scheduled release'),
    );
  }

  updateScheduledRelease(
    releaseId: string,
    changes: Record<string, unknown>,
    targetId?: string,
  ): Promise<IReleaseGroup> {
    this.base.logger.debug('Updating scheduled release', {
      releaseId,
      targetId,
    });

    return this.base.request(
      'updating scheduled release',
      async (http) => {
        const releasePath = `/post-groups/${encodeURIComponent(releaseId)}`;
        const endpoint = targetId
          ? `${releasePath}/targets/${encodeURIComponent(targetId)}`
          : releasePath;
        const response = await http.patch(endpoint, changes);
        return this.base.unwrapObject<IReleaseGroup>(response);
      },
      this.base.failWithDetail('Failed to update scheduled release'),
    );
  }

  controlScheduledRelease(
    releaseId: string,
    action: ScheduledReleaseControlAction,
  ): Promise<IReleaseGroup> {
    this.base.logger.debug('Controlling scheduled release', {
      action,
      releaseId,
    });

    return this.base.request(
      'controlling scheduled release',
      async (http) => {
        // Lifecycle is PATCH /post-groups/:id { action } (REST collapse).
        const response = await http.patch(
          `/post-groups/${encodeURIComponent(releaseId)}`,
          { action },
        );
        return this.base.unwrapObject<IReleaseGroup>(response);
      },
      this.base.failWithDetail('Failed to control scheduled release'),
    );
  }

  listSchedulerCapabilities(
    options: SchedulerCapabilityListOptions = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing scheduler capabilities', { options });

    return this.base.request(
      'listing scheduler capabilities',
      async (http) => {
        const response = await http.get('/schedules/channel-capabilities', {
          params: capabilityListParams(options),
        });
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to list scheduler capabilities'),
    );
  }

  listBrandPublishingReadiness(
    brandId: string,
  ): Promise<IPublishingProviderReadiness[]> {
    this.base.logger.debug('Listing brand publishing readiness', { brandId });

    return this.base.request(
      'listing brand publishing readiness',
      async (http) => {
        const response = await http.get(
          `/credentials/brand/${encodeURIComponent(brandId)}/publishing-readiness`,
        );
        return this.base.unwrapList<IPublishingProviderReadiness>(response);
      },
      this.base.failWithDetail('Failed to list brand publishing readiness'),
    );
  }

  getSchedulerCapability(platform: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting scheduler capability: ${platform}`);

    return this.base.request(
      'getting scheduler capability',
      async (http) => {
        const response = await http.get(
          `/schedules/channel-capabilities/${encodeURIComponent(platform)}`,
        );
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to get scheduler capability'),
    );
  }

  validateSchedulerTarget(
    input: ValidateSchedulerTargetInput,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Validating scheduler target', {
      platform: input.platform,
    });

    return this.base.request(
      'validating scheduler target',
      async (http) => {
        const response = await http.post(
          '/schedules/channel-capabilities/validate',
          input,
        );
        return this.base.unwrapObject<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to validate scheduler target'),
    );
  }
}

function capabilityListParams(
  options: SchedulerCapabilityListOptions,
): Record<string, boolean> {
  const params: Record<string, boolean> = {};
  if (typeof options.includeHidden === 'boolean') {
    params.includeHidden = options.includeHidden;
  }
  if (typeof options.includePlanned === 'boolean') {
    params.includePlanned = options.includePlanned;
  }
  return params;
}
