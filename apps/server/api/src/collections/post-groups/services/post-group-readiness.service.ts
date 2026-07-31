import type { SchedulerTx } from '@api/collections/post-groups/services/post-group.types';
import { buildCredentialTokenPublishingReadiness } from '@genfeedai/integrations/connections';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Token material is selected only to derive presence/expiry signals. It never
 * leaves this service: `buildCredentialTokenPublishingReadiness` returns a
 * sanitized readiness record and the rows are discarded with the query result.
 */
const READINESS_CREDENTIAL_SELECT = {
  accessToken: true,
  accessTokenExpiry: true,
  accessTokenSecret: true,
  id: true,
  isConnected: true,
  oauthToken: true,
  oauthTokenSecret: true,
  platform: true,
  refreshToken: true,
  refreshTokenExpiry: true,
} as const;

type ReadinessCredentialRow = {
  accessToken: string | null;
  accessTokenExpiry: Date | null;
  accessTokenSecret: string | null;
  id: string;
  isConnected: boolean;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  platform: string;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
};

export type SchedulerReadinessTarget = {
  credentialId: string;
  platform: string;
};

@Injectable()
export class PostGroupReadinessService {
  /**
   * Derives sanitized publishing readiness for every credential backing a
   * channel target. Tenant scoping and soft-delete filtering come from
   * `scopedWhere`; no provider network call is made.
   */
  async resolveForCredentials(
    tx: Pick<SchedulerTx, 'credential'>,
    organizationId: string,
    credentialIds: readonly string[],
  ): Promise<Map<string, IPublishingProviderReadiness>> {
    const ids = [...new Set(credentialIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const rows = (await tx.credential.findMany({
      select: READINESS_CREDENTIAL_SELECT,
      where: scopedWhere(organizationId, { id: { in: ids } }),
    })) as ReadinessCredentialRow[];

    return new Map(
      rows.map((row) => [
        row.id,
        buildCredentialTokenPublishingReadiness({
          accessToken: row.accessToken,
          accessTokenExpiresAt: row.accessTokenExpiry,
          accessTokenSecret: row.accessTokenSecret,
          credentialId: row.id,
          isConnected: row.isConnected,
          oauthToken: row.oauthToken,
          oauthTokenSecret: row.oauthTokenSecret,
          providerKey: row.platform,
          refreshToken: row.refreshToken,
          refreshTokenExpiresAt: row.refreshTokenExpiry,
        }),
      ]),
    );
  }

  /**
   * Blocks a target before any publish work is queued when its provider
   * readiness says the channel cannot publish.
   */
  assertSchedulable(
    target: SchedulerReadinessTarget,
    readiness: IPublishingProviderReadiness | undefined,
  ): void {
    if (!readiness) {
      throw new BadRequestException({
        credentialId: target.credentialId,
        detail: `Publishing readiness for ${target.credentialId} on ${target.platform} could not be resolved.`,
        platform: target.platform,
        title: 'Channel readiness unavailable',
      });
    }

    if (readiness.canSchedule) {
      return;
    }

    const blocking = readiness.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );

    throw new BadRequestException({
      classification: blocking?.classification ?? 'unknown',
      credentialId: target.credentialId,
      detail:
        blocking?.message ??
        `Target ${target.credentialId} on ${target.platform} is not ready to publish.`,
      diagnostics: readiness.diagnostics,
      isRetryable: readiness.isRetryable,
      platform: target.platform,
      readinessState: readiness.state,
      requiredAction: readiness.requiredAction,
      title: 'Channel not ready to publish',
    });
  }
}
