import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { QuotaService } from '@api/services/quota/quota.service';
import type { CredentialPlatform } from '@genfeedai/enums';
import { buildCredentialTokenPublishingReadiness } from '@genfeedai/integrations/connections';
import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
  PublishingSetupCheckStatus,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export interface ResolveCredentialPublishingReadinessParams {
  credential: CredentialDocument;
  organizationId: string;
  platform: CredentialPlatform;
}

interface QuotaSignals {
  diagnostics: IPublishingDiagnostic[];
  status: PublishingSetupCheckStatus;
}

/** Fraction of the daily limit above which the account is worth flagging. */
const QUOTA_WARN_RATIO = 0.8;

/**
 * Full-surface publishing readiness for one connected credential.
 *
 * `buildCredentialTokenPublishingReadiness` can only judge token material, so
 * every other axis of `IPublishingProviderReadiness` used to default to
 * `unknown`. This service resolves the axes that live outside the token —
 * deployment configuration and organization quota — and feeds them in, so a
 * caller sees one honest verdict instead of a token check wearing four blanks.
 *
 * `permissionScopeStatus` stays `unknown` on purpose: granted OAuth scopes are
 * requested at connect time and never persisted, so there is nothing to read.
 */
@Injectable()
export class CredentialPublishingReadinessService {
  private quotaService?: QuotaService;

  constructor(
    private readonly publishingProviderSetupService: PublishingProviderSetupService,
    private readonly moduleRef: ModuleRef,
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
    const { credential, platform } = params;
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
      providerKey: platform,
      quotaStatus: quotaSignals.status,
      refreshToken: credential.refreshToken,
      refreshTokenExpiresAt: credential.refreshTokenExpiry,
      setupDiagnostics: [
        ...setupSignals.diagnostics,
        ...quotaSignals.diagnostics,
      ],
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
