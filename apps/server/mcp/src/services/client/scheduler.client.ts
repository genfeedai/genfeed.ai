import type { BaseApiClient } from './base-api-client';

export type ScheduledReleaseControlAction =
  | 'cancel'
  | 'pause'
  | 'publish-now'
  | 'resume';

/**
 * Scheduler release lifecycle proxy. The MCP layer forwards the canonical
 * scheduler request bodies unchanged; validation, organization scope, state
 * transitions, idempotency, and publishing rules remain API-owned.
 */
export class SchedulerClient {
  constructor(private readonly base: BaseApiClient) {}

  createScheduledRelease(
    release: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating scheduled release');

    return this.base.request(
      'creating scheduled release',
      async (http) => {
        const response = await http.post('/post-groups', release, {
          ...(idempotencyKey
            ? { headers: { 'idempotency-key': idempotencyKey } }
            : {}),
        });
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to create scheduled release'),
    );
  }

  getScheduledRelease(releaseId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting scheduled release: ${releaseId}`);

    return this.base.request(
      'getting scheduled release',
      async (http) => {
        const response = await http.get(
          `/post-groups/${encodeURIComponent(releaseId)}`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get scheduled release'),
    );
  }

  updateScheduledRelease(
    releaseId: string,
    changes: Record<string, unknown>,
    targetId?: string,
  ): Promise<Record<string, unknown>> {
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
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to update scheduled release'),
    );
  }

  controlScheduledRelease(
    releaseId: string,
    action: ScheduledReleaseControlAction,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Controlling scheduled release', {
      action,
      releaseId,
    });

    return this.base.request(
      'controlling scheduled release',
      async (http) => {
        const response = await http.post(
          `/post-groups/${encodeURIComponent(releaseId)}/${action}`,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to control scheduled release'),
    );
  }
}
