import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { scopedWhere } from '@api/index';
import { QuotaService } from '@api/services/quota/quota.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getRequiredPublishScopes } from '@genfeedai/constants';
import {
  type CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/enums';
import { resolvePermissionScopeReadiness } from '@genfeedai/helpers';
import { buildCredentialTokenPublishingReadiness } from '@genfeedai/integrations/connections';
import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
  IPublishingProviderSetupSignals,
  PermissionScopeReadinessResult,
  PublishingSetupCheckStatus,
} from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface ResolveCredentialPublishingReadinessParams {
  credential: CredentialDocument;
  organizationId: string;
  platform: CredentialPlatform;
}

/**
 * Anything that can read credentials: the request-scoped `PrismaService` for
 * reads, or the scheduler's transaction client so the write path resolves
 * readiness against the same snapshot it persists against.
 */
export type PublishingReadinessCredentialClient = Pick<
  Prisma.TransactionClient,
  'credential'
>;

interface QuotaSignals {
  diagnostics: IPublishingDiagnostic[];
  status: PublishingSetupCheckStatus;
}

/**
 * Token material is selected only to derive presence/expiry signals. It never
 * leaves this service: `buildCredentialTokenPublishingReadiness` returns a
 * sanitized readiness record and the rows are discarded with the query result.
 */
const READINESS_CREDENTIAL_SELECT = {
  accessToken: true,
  accessTokenExpiry: true,
  accessTokenSecret: true,
  grantedScopes: true,
  grantedScopesCapturedAt: true,
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
  grantedScopes: string[];
  grantedScopesCapturedAt: Date | null;
  id: string;
  isConnected: boolean;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  platform: string;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
};

/** Fraction of the daily limit above which the account is worth flagging. */
const QUOTA_WARN_RATIO = 0.8;

function requireDomainCredentialPlatform(
  platform: string | null | undefined,
): CredentialPlatform {
  const mapped = fromPrismaCredentialPlatform(platform);
  if (!mapped) {
    throw new Error(`Unknown credential platform: ${platform ?? 'missing'}`);
  }
  return mapped;
}

/**
 * Full-surface publishing readiness for one connected credential.
 *
 * `buildCredentialTokenPublishingReadiness` can only judge token material, so
 * every other axis of `IPublishingProviderReadiness` used to default to
 * `unknown`. This service resolves the axes that live outside the token —
 * deployment configuration and organization quota — and feeds them in, so a
 * caller sees one honest verdict instead of a token check wearing four blanks.
 *
 * `permissionScopeStatus` is derived from persisted `grantedScopes` against
 * the platform's required publish scopes. Credentials connected before capture
 * shipped, and platforms that never return a scope field, stay `unknown`.
 */
@Injectable()
export class CredentialPublishingReadinessService {
  private quotaService?: QuotaService;

  constructor(
    private readonly publishingProviderSetupService: PublishingProviderSetupService,
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `QuotaService` is resolved lazily instead of injected. `CredentialsCoreModule`
   * is a leaf that half the module graph imports, and `QuotaModule` sits far above
   * it — importing it here closes the ring
   * `credentials-core -> quota -> organizations -> integrations -> credentials-core`,
   * which webpack evaluates before Nest ever sees a `forwardRef`. Mirrors how
   * `QuotaService` itself reaches `PostsService`.
   */
  private getQuotaService(): QuotaService {
    this.quotaService ??= this.moduleRef.get(QuotaService, { strict: false });

    if (!this.quotaService) {
      throw new Error('QuotaService not available');
    }

    return this.quotaService;
  }

  async resolve(
    params: ResolveCredentialPublishingReadinessParams,
  ): Promise<IPublishingProviderReadiness> {
    const { credential } = params;
    const platform = requireDomainCredentialPlatform(params.platform);
    const credentialId = String(credential.id);
    const checkedAt = new Date().toISOString();

    const setupSignals =
      this.publishingProviderSetupService.resolveProviderSignals(
        platform,
        checkedAt,
      );
    const quotaSignals = await this.resolveQuotaSignals(
      credentialId,
      params.organizationId,
      checkedAt,
    );

    const permissionSignals = this.resolvePermissionSignals(
      platform,
      credential.grantedScopes,
      credential.grantedScopesCapturedAt,
      checkedAt,
    );

    return buildCredentialTokenPublishingReadiness({
      accessToken: credential.accessToken,
      accessTokenExpiresAt: credential.accessTokenExpiry,
      accessTokenSecret: credential.accessTokenSecret,
      appReviewStatus: setupSignals.appReviewStatus,
      callbackUrlStatus: setupSignals.callbackUrlStatus,
      credentialId,
      isConnected: credential.isConnected,
      oauthToken: credential.oauthToken,
      oauthTokenSecret: credential.oauthTokenSecret,
      permissionScopeStatus: permissionSignals.status,
      providerKey: platform,
      quotaStatus: quotaSignals.status,
      refreshToken: credential.refreshToken,
      refreshTokenExpiresAt: credential.refreshTokenExpiry,
      setupDiagnostics: [
        ...setupSignals.diagnostics,
        ...quotaSignals.diagnostics,
        ...permissionSignals.diagnostics,
      ],
    });
  }

  /**
   * Batch readiness for a set of credentials, keyed by credential ID.
   *
   * Deployment setup axes are folded in so every caller is gated on the same
   * signals the setup checklist reports. They are pure configuration reads and
   * are memoized per platform, so this stays a single query no matter how many
   * credentials are asked for — it runs inside the scheduler's write
   * transaction. Quota is deliberately left `unknown` here: measuring it costs
   * four queries per credential and can only ever produce `degraded`, which
   * never changes whether a channel may be scheduled.
   */
  async resolveForCredentials(
    client: PublishingReadinessCredentialClient,
    organizationId: string,
    credentialIds: readonly string[],
  ): Promise<Map<string, IPublishingProviderReadiness>> {
    const ids = [...new Set(credentialIds)];
    if (ids.length === 0) {
      return new Map();
    }

    const rows = (await client.credential.findMany({
      select: READINESS_CREDENTIAL_SELECT,
      where: scopedWhere(organizationId, { id: { in: ids } }),
    })) as ReadinessCredentialRow[];

    return this.buildReadinessByCredentialId(rows);
  }

  /**
   * Readiness for every connected channel of one brand, ordered like the
   * credential list the channel picker renders. Selection surfaces need the
   * whole set up front; asking per credential would fan out one request per
   * channel before the user has typed anything.
   */
  async resolveForBrand(
    organizationId: string,
    brandId: string,
  ): Promise<IPublishingProviderReadiness[]> {
    const rows = (await this.prisma.credential.findMany({
      orderBy: { createdAt: 'asc' },
      select: READINESS_CREDENTIAL_SELECT,
      where: scopedWhere(organizationId, { brandId, isConnected: true }),
    })) as ReadinessCredentialRow[];

    return [...this.buildReadinessByCredentialId(rows).values()];
  }

  private buildReadinessByCredentialId(
    rows: readonly ReadinessCredentialRow[],
  ): Map<string, IPublishingProviderReadiness> {
    // One instant for the whole batch so every record's diagnostics agree.
    const checkedAt = new Date().toISOString();
    const signalsByPlatform = new Map<
      string,
      IPublishingProviderSetupSignals
    >();
    const resolveSignals = (
      platform: string,
    ): IPublishingProviderSetupSignals => {
      const cached = signalsByPlatform.get(platform);
      if (cached) {
        return cached;
      }

      const signals =
        this.publishingProviderSetupService.resolveProviderSignals(
          platform,
          checkedAt,
        );
      signalsByPlatform.set(platform, signals);
      return signals;
    };

    const entries: [string, IPublishingProviderReadiness][] = rows.map(
      (row) => {
        const platform = requireDomainCredentialPlatform(row.platform);
        const signals = resolveSignals(platform);

        const permissionSignals = this.resolvePermissionSignals(
          platform,
          row.grantedScopes,
          row.grantedScopesCapturedAt,
          checkedAt,
        );

        return [
          row.id,
          buildCredentialTokenPublishingReadiness({
            accessToken: row.accessToken,
            accessTokenExpiresAt: row.accessTokenExpiry,
            accessTokenSecret: row.accessTokenSecret,
            appReviewStatus: signals.appReviewStatus,
            callbackUrlStatus: signals.callbackUrlStatus,
            credentialId: row.id,
            isConnected: row.isConnected,
            oauthToken: row.oauthToken,
            oauthTokenSecret: row.oauthTokenSecret,
            permissionScopeStatus: permissionSignals.status,
            providerKey: platform,
            refreshToken: row.refreshToken,
            refreshTokenExpiresAt: row.refreshTokenExpiry,
            setupDiagnostics: [
              ...signals.diagnostics,
              ...permissionSignals.diagnostics,
            ],
          }),
        ];
      },
    );

    return new Map(entries);
  }

  private resolvePermissionSignals(
    platform: string,
    grantedScopes: readonly string[] | null | undefined,
    grantedScopesCapturedAt: Date | string | null | undefined,
    checkedAt: string,
  ): PermissionScopeReadinessResult {
    return resolvePermissionScopeReadiness({
      checkedAt,
      grantedScopes: grantedScopes ?? [],
      hasCapturedGrantedScopes: grantedScopesCapturedAt != null,
      requiredScopes: getRequiredPublishScopes(platform),
    });
  }

  /**
   * A platform with no configured daily limit reports `unknown` rather than
   * `pass` — an unmetered platform and an unlimited one are different answers.
   */
  private async resolveQuotaSignals(
    credentialId: string,
    organizationId: string,
    checkedAt: string,
  ): Promise<QuotaSignals> {
    const quota = await this.getQuotaService().getQuotaStatus(
      credentialId,
      organizationId,
    );

    if (!quota || quota.dailyLimit <= 0) {
      return { diagnostics: [], status: 'unknown' };
    }

    const details = {
      currentCount: quota.currentCount,
      dailyLimit: quota.dailyLimit,
    };

    if (quota.currentCount >= quota.dailyLimit) {
      return {
        diagnostics: [
          {
            checkedAt,
            classification: 'quota_or_rate_limit',
            code: 'credential_daily_quota_exhausted',
            correctiveAction:
              'Wait for the daily quota to reset at midnight UTC, or raise the limit in organization settings.',
            details,
            isRetryable: true,
            message: `The daily posting quota for this account is used up (${quota.currentCount}/${quota.dailyLimit}).`,
            scope: 'quota',
            severity: 'error',
          },
        ],
        status: 'fail',
      };
    }

    if (quota.currentCount / quota.dailyLimit >= QUOTA_WARN_RATIO) {
      return {
        diagnostics: [
          {
            checkedAt,
            classification: 'quota_or_rate_limit',
            code: 'credential_daily_quota_nearly_exhausted',
            correctiveAction:
              'Schedule the remaining posts for tomorrow, or raise the limit in organization settings.',
            details,
            isRetryable: true,
            message: `This account is close to its daily posting quota (${quota.currentCount}/${quota.dailyLimit}).`,
            scope: 'quota',
            severity: 'warning',
          },
        ],
        status: 'warn',
      };
    }

    return { diagnostics: [], status: 'pass' };
  }
}
