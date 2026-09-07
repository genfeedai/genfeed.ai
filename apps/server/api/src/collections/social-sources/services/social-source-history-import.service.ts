import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { SocialSourceDocument } from '@api/collections/social-sources/schemas/social-source.schema';
import {
  buildSocialSourceHistoryImportWorkflowDefinition,
  SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_ID,
} from '@api/collections/social-sources/services/social-source-history-import-workflow-definition';
import {
  buildProfileUrl,
  toSocialSourcePlatform,
} from '@api/collections/social-sources/utils/social-source-handle.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  SocialSourceHistoryImportStatus,
  SocialSourceType,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type {
  SocialSourceHistoryImport,
  SocialSourceHistoryImportScheduleResult,
  SocialSourceHistoryImportWorkflowInput,
  SocialSourceMetadata,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** How far back a connect-time import reaches. */
export const SOCIAL_HISTORY_IMPORT_WINDOW_DAYS = 90;
/** Upper bound on posts pulled per import, whatever the window holds. */
export const SOCIAL_HISTORY_IMPORT_LIMIT = 300;
const ACTIVITY_SOURCE = 'social-source-history-import';

interface HistoryImportCompletion {
  importedCount: number;
  provider?: string | null;
  rejectedCount: number;
}

/**
 * Own-account history import: when a brand connects a social credential, this
 * creates (or revives) the brand's own-account social source and queues a
 * background import of the account's existing posts. Every transition is
 * written to `metadata.historyImport` on the source and mirrored as an
 * Activity so the brand can audit what was imported and when.
 *
 * Scheduling lives apart from the run so integration controllers can depend on
 * it without pulling the collector chain (which itself depends on them).
 */
@Injectable()
export class SocialSourceHistoryImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Called after an OAuth credential is (re)connected. Never throws: a failed
   * schedule must not fail the connection itself.
   */
  async scheduleForCredential(params: {
    credentialId: string;
    organizationId: string;
    userId?: string;
  }): Promise<SocialSourceHistoryImportScheduleResult> {
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(params.organizationId, { id: params.credentialId }),
    });
    if (!credential?.brandId) {
      return { skipReason: 'credential_unavailable', status: 'skipped' };
    }
    const userId = params.userId ?? credential.userId ?? undefined;
    if (!userId) {
      return { skipReason: 'credential_unavailable', status: 'skipped' };
    }

    const brand = await this.prisma.brand.findFirst({
      where: scopedWhere(params.organizationId, { id: credential.brandId }),
    });
    if (!brand) {
      return { skipReason: 'credential_unavailable', status: 'skipped' };
    }

    const activityBase = {
      brandId: credential.brandId,
      organizationId: params.organizationId,
      userId,
    };
    const platform = toSocialSourcePlatform(credential.platform);
    if (!platform) {
      await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED, {
        ...activityBase,
        entityId: credential.id,
        value: {
          credentialId: credential.id,
          platform: credential.platform,
          skipReason: 'unsupported_platform',
        },
      });
      return { skipReason: 'unsupported_platform', status: 'skipped' };
    }

    if (!brand.isSocialHistoryImportEnabled) {
      await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED, {
        ...activityBase,
        entityId: credential.id,
        value: {
          credentialId: credential.id,
          platform,
          skipReason: 'brand_opted_out',
        },
      });
      return { skipReason: 'brand_opted_out', status: 'skipped' };
    }

    const handle = resolveHandle(credential);
    if (!handle) {
      await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_SKIPPED, {
        ...activityBase,
        entityId: credential.id,
        value: {
          credentialId: credential.id,
          platform,
          skipReason: 'missing_handle',
        },
      });
      return { skipReason: 'missing_handle', status: 'skipped' };
    }

    const historyImport: SocialSourceHistoryImport = {
      credentialId: credential.id,
      requestedAt: new Date().toISOString(),
      status: SocialSourceHistoryImportStatus.SCHEDULED,
      windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
    };
    const source = await this.upsertOwnAccountSource({
      brandId: credential.brandId,
      credential,
      handle,
      historyImport,
      organizationId: params.organizationId,
      platform,
      userId,
    });

    await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_SCHEDULED, {
      ...activityBase,
      entityId: source.id,
      value: {
        credentialId: credential.id,
        handle,
        limit: SOCIAL_HISTORY_IMPORT_LIMIT,
        platform,
        windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
      },
    });

    const request: SocialSourceHistoryImportWorkflowInput = {
      brandId: credential.brandId,
      credentialId: credential.id,
      limit: SOCIAL_HISTORY_IMPORT_LIMIT,
      organizationId: params.organizationId,
      sourceId: source.id,
      userId,
      windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
    };
    const definition = buildSocialSourceHistoryImportWorkflowDefinition();
    await this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: SOCIAL_SOURCE_HISTORY_IMPORT_WORKFLOW_ID,
        inputValues: { request },
        organizationId: params.organizationId,
        source: ACTIVITY_SOURCE,
        trigger: WorkflowExecutionTrigger.EVENT,
        userId,
      },
      `social-source-history-import-${source.id}`,
      { attempts: 2, replaceTerminalJob: true },
    );

    this.logger.log('Scheduled social account history import', {
      credentialId: credential.id,
      handle,
      platform,
      sourceId: source.id,
    });

    return { sourceId: source.id, status: 'scheduled' };
  }

  /**
   * Re-run the import for an existing own-account source (manual retry, or a
   * brand that opted in after connecting).
   */
  async rescheduleForSource(
    source: SocialSourceDocument,
    userId: string,
  ): Promise<SocialSourceHistoryImportScheduleResult> {
    if (
      source.sourceType !== SocialSourceType.OWN_ACCOUNT ||
      !source.credentialId
    ) {
      return { skipReason: 'credential_unavailable', status: 'skipped' };
    }
    return this.scheduleForCredential({
      credentialId: source.credentialId,
      organizationId: source.organizationId,
      userId,
    });
  }

  async markRunning(source: SocialSourceDocument): Promise<void> {
    await this.writeHistoryImport(source, {
      startedAt: new Date().toISOString(),
      status: SocialSourceHistoryImportStatus.RUNNING,
    });
  }

  async markCompleted(
    source: SocialSourceDocument,
    completion: HistoryImportCompletion,
  ): Promise<void> {
    await this.writeHistoryImport(source, {
      completedAt: new Date().toISOString(),
      error: null,
      importedCount: completion.importedCount,
      provider: completion.provider ?? null,
      rejectedCount: completion.rejectedCount,
      status: SocialSourceHistoryImportStatus.COMPLETED,
    });
    await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_COMPLETED, {
      brandId: source.brandId,
      entityId: source.id,
      organizationId: source.organizationId,
      userId: source.userId,
      value: {
        credentialId: source.credentialId,
        handle: source.handle,
        importedCount: completion.importedCount,
        platform: source.platform,
        provider: completion.provider ?? null,
        rejectedCount: completion.rejectedCount,
      },
    });
  }

  async markFailed(source: SocialSourceDocument, error: string): Promise<void> {
    await this.writeHistoryImport(source, {
      completedAt: new Date().toISOString(),
      error: error.slice(0, 500),
      status: SocialSourceHistoryImportStatus.FAILED,
    });
    await this.recordActivity(ActivityKey.SOCIAL_HISTORY_IMPORT_FAILED, {
      brandId: source.brandId,
      entityId: source.id,
      organizationId: source.organizationId,
      userId: source.userId,
      value: {
        credentialId: source.credentialId,
        error: error.slice(0, 500),
        handle: source.handle,
        platform: source.platform,
      },
    });
  }

  private async upsertOwnAccountSource(params: {
    brandId: string;
    credential: {
      externalAvatar: string | null;
      externalId: string | null;
      externalName: string | null;
      id: string;
    };
    handle: string;
    historyImport: SocialSourceHistoryImport;
    organizationId: string;
    platform: string;
    userId: string;
  }): Promise<SocialSourceDocument> {
    const { credential } = params;
    const identity = {
      brandId: params.brandId,
      platform: params.platform,
      sourceType: SocialSourceType.OWN_ACCOUNT,
    };
    // Reconnecting the same account must revive its source rather than
    // duplicate it, so tombstoned rows are matched explicitly here.
    const existing =
      (await this.prisma.socialSource.findFirst({
        where: scopedWhere(params.organizationId, {
          ...identity,
          OR: [{ credentialId: credential.id }, { handle: params.handle }],
        }),
      })) ??
      (await this.prisma.socialSource.findFirst({
        where: scopedWhere(params.organizationId, {
          ...identity,
          isDeleted: true,
          OR: [{ credentialId: credential.id }, { handle: params.handle }],
        }),
      }));

    const profile = {
      avatarUrl: credential.externalAvatar ?? existing?.avatarUrl ?? null,
      credentialId: credential.id,
      displayName: credential.externalName ?? existing?.displayName ?? null,
      externalId: credential.externalId ?? existing?.externalId ?? null,
      handle: params.handle,
      isActive: true,
      isDeleted: false,
      profileUrl: buildProfileUrl(params.platform, params.handle),
    };

    if (existing) {
      const metadata = readMetadata(existing.metadata);
      // The matched row may be a tombstone being revived, so its current
      // isDeleted value is part of the scope rather than the default.
      await this.prisma.socialSource.updateMany({
        data: {
          ...profile,
          metadata: toMetadataJson({
            ...metadata,
            historyImport: params.historyImport,
          }),
        },
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          id: existing.id,
          isDeleted: existing.isDeleted,
        }),
      });
      const revived = await this.prisma.socialSource.findFirst({
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          id: existing.id,
        }),
      });
      if (!revived) {
        throw new Error(
          `Own-account source ${existing.id} disappeared while scheduling its history import`,
        );
      }
      return revived;
    }

    return this.prisma.socialSource.create({
      data: {
        ...identity,
        ...profile,
        bio: null,
        followersCount: null,
        metadata: toMetadataJson({ historyImport: params.historyImport }),
        organizationId: params.organizationId,
        userId: params.userId,
      },
    });
  }

  private async writeHistoryImport(
    source: SocialSourceDocument,
    patch: Partial<SocialSourceHistoryImport>,
  ): Promise<void> {
    const metadata = readMetadata(source.metadata);
    const current: SocialSourceHistoryImport = metadata.historyImport ?? {
      credentialId: source.credentialId ?? '',
      requestedAt: new Date().toISOString(),
      status: SocialSourceHistoryImportStatus.SCHEDULED,
      windowDays: SOCIAL_HISTORY_IMPORT_WINDOW_DAYS,
    };
    await this.prisma.socialSource.updateMany({
      data: {
        metadata: toMetadataJson({
          ...metadata,
          historyImport: { ...current, ...patch },
        }),
      },
      where: scopedWhere(source.organizationId, {
        brandId: source.brandId,
        id: source.id,
      }),
    });
  }

  private async recordActivity(
    key: ActivityKey,
    input: {
      brandId: string;
      entityId: string;
      organizationId: string;
      userId: string;
      value: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.activitiesService.create({
        brandId: input.brandId,
        entityId: input.entityId,
        key,
        organizationId: input.organizationId,
        source: ACTIVITY_SOURCE,
        userId: input.userId,
        value: JSON.stringify(input.value),
      });
    } catch (error: unknown) {
      this.logger.warn('Failed to record history import activity', {
        error: (error as Error)?.message,
        key,
      });
    }
  }
}

function resolveHandle(credential: {
  externalHandle: string | null;
  username: string | null;
}): string | undefined {
  const candidate = credential.externalHandle ?? credential.username;
  const handle = candidate?.trim().replace(/^@/, '').toLowerCase();
  return handle ? handle : undefined;
}

function readMetadata(value: unknown): SocialSourceMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SocialSourceMetadata)
    : {};
}

/**
 * Round-trip through JSON so the typed metadata becomes a plain Prisma JSON
 * object (drops `undefined` fields, which JSON columns cannot hold).
 */
function toMetadataJson(
  metadata: SocialSourceMetadata,
): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonObject;
}
