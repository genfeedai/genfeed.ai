import type { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { ScheduledPostWorkflowInput } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import {
  type CredentialDocument,
  type ServerCredentialStore,
  type ServerPublisherFactory,
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from '@api/index';
import type { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import type { QuotaService } from '@api/services/quota/quota.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  type Platform,
} from '@genfeedai/contracts';
import {
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import {
  createQuotaExceededActivity,
  type QuotaCheckResult,
} from '@workers/crons/posts/post-publish-error.util';
import { readPostString } from '@workers/services/scheduled-post.utils';
import type {
  DeliveryGateFailure,
  DeliveryLoad,
  PostDeliveryIds,
  PreparedPostDelivery,
} from '@workers/services/scheduled-post-delivery.types';
import {
  collectMediaGateAssetIds,
  readMediaGateOutcome,
  toValidationMedia,
} from '@workers/services/scheduled-post-media-gate.util';

function toDomainPlatform(
  platform: CredentialDocument['platform'] | string | null | undefined,
): string {
  return (
    fromPrismaCredentialPlatform(String(platform ?? '')) ??
    String(platform ?? '')
  );
}

export function readDeliveryIds(post: PostEntity): PostDeliveryIds {
  return {
    brandId: readPostString(post, ['brandId']),
    credentialId: readPostString(post, ['credentialId']),
    organizationId: readPostString(post, ['organizationId']),
    userId: readPostString(post, ['userId']),
  };
}

/**
 * Resource loading, publisher preparation and the pre-provider gates of a
 * scheduled delivery. Gates only report a failure; the delivery decides when
 * to record it, because only the holder of a fresh reservation may fail the
 * target.
 */
export class ScheduledPostDeliveryGates {
  constructor(
    private readonly logger: LoggerService,
    private readonly credentialsService: ServerCredentialStore,
    private readonly organizationsService: OrganizationsService,
    private readonly quotaService: QuotaService,
    private readonly publisherFactory: ServerPublisherFactory,
    private readonly publishingReadinessService: CredentialPublishingReadinessService,
    private readonly prisma: PrismaService,
    private readonly mediaReadinessService: MediaReadinessService,
  ) {}

  async loadResources(
    post: PostEntity,
    ids: PostDeliveryIds,
    url: string,
  ): Promise<
    DeliveryLoad<{
      credential: CredentialDocument;
      organization: OrganizationDocument;
    }>
  > {
    const credential = (await this.credentialsService.findOne({
      id: ids.credentialId,
      isDeleted: false,
      ...(ids.organizationId ? { organizationId: ids.organizationId } : {}),
    })) as CredentialDocument | null;
    if (!credential) {
      this.logger.error(`${url} credential not found`, { postId: post.id });
      return {
        ok: false,
        failure: {
          code: 'credential_not_found',
          isRetryable: false,
          message: 'Credential not found',
          platform: '',
        },
      };
    }

    const organization = (await this.organizationsService.findOne({
      id: ids.organizationId,
      isDeleted: false,
    })) as OrganizationDocument | null;
    if (!organization) {
      this.logger.error(`${url} organization not found`, {
        postId: post.id,
      });
      return {
        ok: false,
        failure: {
          code: 'organization_not_found',
          isRetryable: false,
          message: 'Organization not found',
          platform: '',
        },
      };
    }

    return { ok: true, value: { credential, organization } };
  }

  /** Credential gates before a provider call: channel readiness and quota. */
  async checkCredential(
    post: PostEntity,
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
  ): Promise<DeliveryGateFailure | null> {
    return (
      (await this.checkChannelReady(post, ids, credential, url)) ??
      (await this.checkQuota(post, credential, organization, url))
    );
  }

  /** Content gates before a provider call: target settings and media. */
  async checkContent(
    post: PostEntity,
    ids: PostDeliveryIds,
    prepared: PreparedPostDelivery,
    url: string,
  ): Promise<DeliveryGateFailure | null> {
    const targetValidation = validateChannelTargetSettings({
      caption: post.description,
      credentialId: ids.credentialId ?? undefined,
      media: toValidationMedia(post),
      platform: prepared.platform,
      publishMode: 'publish_now',
      settings: resolveChannelTargetSettings(
        prepared.platform,
        post.targetSettings,
      ),
      visibility: prepared.context.visibility,
    });
    if (!targetValidation.valid) {
      return {
        code: 'channel_target_invalid',
        isRetryable: false,
        message:
          targetValidation.errors[0]?.message ??
          'Channel target validation failed',
        platform: prepared.platform,
      };
    }

    return this.checkMediaReady(post, ids, prepared.platform, url);
  }

  prepare(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
  ): DeliveryLoad<PreparedPostDelivery> {
    const prepared = this.buildPreparedDelivery(
      post,
      source,
      ids,
      credential,
      organization,
    );
    if (prepared) {
      return { ok: true, value: prepared };
    }

    const platform = String(credential.platform ?? '');
    this.logger.error(`${url} unsupported platform`, {
      platform,
      postId: post.id,
    });
    return {
      ok: false,
      failure: {
        code: 'unsupported_platform',
        isRetryable: false,
        message: 'Unsupported platform',
        platform: fromPrismaCredentialPlatform(platform) ?? platform,
      },
    };
  }

  /**
   * Best-effort delivery context for persisting an accepted receipt. Missing
   * credentials or publishers only skip follow-up work; they never fail it.
   */
  async loadRecoveryDelivery(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    url: string,
  ): Promise<PreparedPostDelivery | null> {
    try {
      const credential = (await this.credentialsService.findOne({
        id: ids.credentialId,
        isDeleted: false,
        ...(ids.organizationId ? { organizationId: ids.organizationId } : {}),
      })) as CredentialDocument | null;
      const organization = (await this.organizationsService.findOne({
        id: ids.organizationId,
        isDeleted: false,
      })) as OrganizationDocument | null;
      if (!credential || !organization) return null;
      return this.buildPreparedDelivery(
        post,
        source,
        ids,
        credential,
        organization,
      );
    } catch (error: unknown) {
      this.logger.warn(`${url} recovery delivery context unavailable`, {
        error: getErrorMessage(error),
        postId: post.id.toString(),
      });
      return null;
    }
  }

  private async checkChannelReady(
    post: PostEntity,
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    url: string,
  ): Promise<DeliveryGateFailure | null> {
    const readiness = (
      await this.publishingReadinessService.resolveForCredentials(
        this.prisma,
        ids.organizationId ?? '',
        [ids.credentialId ?? ''],
      )
    ).get(ids.credentialId ?? '');

    if (readiness?.canSchedule) {
      return null;
    }

    const blocking = readiness?.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    this.logger.error(`${url} channel not ready to publish`, {
      classification: blocking?.classification,
      credentialId: ids.credentialId,
      platform: credential.platform,
      postId: post.id,
      readinessState: readiness?.state ?? 'unresolved',
    });

    return {
      code: blocking?.code ?? 'channel_not_ready',
      isRetryable: readiness?.isRetryable ?? false,
      message: blocking?.message ?? 'Channel is not ready to publish',
      platform: toDomainPlatform(credential.platform),
    };
  }

  private async checkQuota(
    post: PostEntity,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
  ): Promise<DeliveryGateFailure | null> {
    const quotaCheck = (await this.quotaService.checkQuota(
      credential,
      organization,
    )) as QuotaCheckResult;
    if (quotaCheck.allowed) {
      return null;
    }

    this.logger.warn(`${url} quota exceeded for ${credential.platform}`, {
      currentCount: quotaCheck.currentCount,
      dailyLimit: quotaCheck.dailyLimit,
      platform: credential.platform,
      postId: post.id,
    });

    const platform = toDomainPlatform(credential.platform);
    return {
      activity: createQuotaExceededActivity(post, quotaCheck, platform),
      code: 'quota_exceeded',
      isRetryable: false,
      message: 'Quota exceeded',
      platform,
    };
  }

  /**
   * Deterministic media readiness gate (#4878).
   *
   * The last check before the provider call, so an asset that breaks the
   * target platform's published media spec is reported as a channel failure
   * instead of bouncing back as a provider error. `warning` diagnostics are
   * recorded and let the publish proceed.
   */
  private async checkMediaReady(
    post: PostEntity,
    ids: PostDeliveryIds,
    platform: Platform,
    url: string,
  ): Promise<DeliveryGateFailure | null> {
    const assetIds = collectMediaGateAssetIds(post);
    if (assetIds.length === 0) {
      return null;
    }

    const outcome = readMediaGateOutcome(
      await this.mediaReadinessService.evaluatePublishReadiness({
        assetIds,
        organizationId: ids.organizationId ?? '',
        platforms: [platform],
      }),
    );
    const context = { platform, postId: post.id };
    if (outcome.warnings.length > 0) {
      this.logger.warn(`${url} media readiness warnings`, {
        ...context,
        diagnostics: outcome.warnings,
      });
    }
    if (outcome.blockers.length === 0) {
      return null;
    }

    this.logger.error(`${url} media readiness blocked publish`, {
      ...context,
      diagnostics: outcome.blockers,
    });
    return {
      code: outcome.code,
      isRetryable: false,
      message: outcome.message,
      platform,
    };
  }

  private buildPreparedDelivery(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    organization: OrganizationDocument,
  ): PreparedPostDelivery | null {
    const platform = fromPrismaCredentialPlatform(
      String(credential.platform ?? ''),
    );
    const publisher = platform
      ? this.publisherFactory.getPublisher(platform)
      : null;
    if (!platform || !publisher) {
      return null;
    }

    const resolvedSettings = resolveChannelTargetSettings(
      platform,
      post.targetSettings,
    );
    const visibility = resolvePostVisibility(post.visibility);
    const settings =
      source === 'tiktok_app'
        ? {
            ...resolvedSettings,
            [TIKTOK_APP_HANDOFF_SETTING]: true,
          }
        : platform === CredentialPlatform.BEEHIIV &&
            source !== 'publish_now' &&
            post.scheduledDate instanceof Date
          ? {
              ...resolvedSettings,
              [WORKFLOW_APPROVED_SCHEDULE_SETTING]:
                post.scheduledDate.toISOString(),
            }
          : resolvedSettings;

    return {
      context: {
        brandId: ids.brandId ?? '',
        credential,
        organization,
        organizationId: ids.organizationId ?? '',
        post,
        postId: post.id.toString(),
        settings,
        visibility,
      },
      credential,
      platform,
      publisher,
    };
  }
}
