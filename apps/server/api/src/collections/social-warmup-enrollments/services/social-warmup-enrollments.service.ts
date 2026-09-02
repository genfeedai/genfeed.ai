import type { CompleteSocialWarmupItemDto } from '@api/collections/social-warmup-enrollments/dto/complete-social-warmup-item.dto';
import type { CreateSocialWarmupEnrollmentDto } from '@api/collections/social-warmup-enrollments/dto/create-social-warmup-enrollment.dto';
import type { SocialWarmupEnrollmentsQueryDto } from '@api/collections/social-warmup-enrollments/dto/social-warmup-enrollments-query.dto';
import type { UpsertSocialWarmupSignalDto } from '@api/collections/social-warmup-enrollments/dto/upsert-social-warmup-signal.dto';
import type { SocialWarmupEnrollmentDocument } from '@api/collections/social-warmup-enrollments/schemas/social-warmup-enrollment.schema';
import {
  authorizedEvidenceFromWarmupSignals,
  completedItemIdsFromEvents,
  hasPartialSocialWarmupScopes,
  isEnrollmentUniqueViolation,
  isSignalUniqueViolation,
  mapTikTokSource,
  mapTikTokStatus,
  reconnectForCredential,
  type StoredSocialWarmupEventRecord,
  type StoredSocialWarmupSignalRecord,
  safeSignalEvidence,
  socialWarmupEnrollmentStateFromStorage,
  socialWarmupEventRecordFromStorage,
  socialWarmupSignalRecordFromStorage,
} from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollment.helpers';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  parsePlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/contracts';
import type { InstagramAuthorizedSignalsSnapshot } from '@genfeedai/contracts/api-types/contracts/instagram-authorized-signals.contract';
import type { LinkedinAuthorizedSignalsSnapshot } from '@genfeedai/contracts/api-types/contracts/linkedin-authorized-signals.contract';
import {
  getCurrentSocialWarmupBlueprint,
  resolveSocialWarmupBlueprint,
  type SocialWarmupBlueprint,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import { getSocialWarmupEnrollmentRefusal } from '@genfeedai/contracts/api-types/contracts/social-warmup-capability.contract';
import {
  evaluateSocialWarmupJourney,
  SOCIAL_WARMUP_TELEMETRY_EVENT,
  sanitizeSocialWarmupTelemetry,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-journey.contract';
import type { TikTokAuthorizedSignalsSnapshot } from '@genfeedai/contracts/api-types/contracts/tiktok-authorized-signals.contract';
import type { TwitterAuthorizedSignalsSnapshot } from '@genfeedai/contracts/api-types/contracts/twitter-authorized-signals.contract';
import type { YoutubeAuthorizedSignalsSnapshot } from '@genfeedai/contracts/api-types/contracts/youtube-authorized-signals.contract';
import type {
  SocialWarmupEventProvenance,
  SocialWarmupScope,
  SyncSocialWarmupPlatformSnapshotInput,
} from '@genfeedai/contracts/interfaces';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const enrollmentInclude = {
  events: {
    orderBy: { occurredAt: 'asc' as const },
    where: { isDeleted: false },
  },
  signals: {
    orderBy: { key: 'asc' as const },
    where: { isDeleted: false },
  },
} as const;

type AuthorizedSignalsSnapshot =
  | TikTokAuthorizedSignalsSnapshot
  | InstagramAuthorizedSignalsSnapshot
  | TwitterAuthorizedSignalsSnapshot
  | YoutubeAuthorizedSignalsSnapshot
  | LinkedinAuthorizedSignalsSnapshot;

interface SyncAuthorizedSnapshotParams {
  brandId: string;
  credentialId: string;
  organizationId: string;
  snapshot: AuthorizedSignalsSnapshot;
}

interface SyncYoutubeAuthorizedSnapshotParams {
  brandId: string;
  credentialId: string;
  organizationId: string;
  snapshot: YoutubeAuthorizedSignalsSnapshot;
}

@Injectable()
export class SocialWarmupEnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  async enrollScoped(
    dto: CreateSocialWarmupEnrollmentDto,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const credential = await this.requireCredential(dto.credentialId, context);
    const existing = await this.prisma.socialWarmupEnrollment.findFirst({
      include: enrollmentInclude,
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        credentialId: credential.id,
      }),
    });
    if (existing) {
      return this.hydrateEnrollment(existing, credential);
    }

    const refusal = getSocialWarmupEnrollmentRefusal(credential.platform);
    if (refusal) {
      throw new BadRequestException(refusal.message);
    }

    const platform = parsePlatform(credential.platform);
    const blueprint = platform
      ? getCurrentSocialWarmupBlueprint(platform)
      : undefined;
    if (!platform || !blueprint) {
      throw new BadRequestException(
        `No social warm-up blueprint is published for ${credential.platform}.`,
      );
    }

    const startedAt = new Date();
    const signalCreates = this.signalCreatesFromCredential(credential);

    try {
      const created = await this.prisma.socialWarmupEnrollment.create({
        data: {
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
          brandId: context.brandId,
          credentialId: credential.id,
          currentPhaseId: blueprint.phases[0]?.id ?? blueprint.id,
          enrolledByUserId: context.userId,
          organizationId: context.organizationId,
          signals:
            signalCreates.length > 0 ? { create: signalCreates } : undefined,
          startedAt,
          state: SocialWarmupEnrollmentState.ENROLLED,
        },
        include: enrollmentInclude,
      });
      const enrollment = await this.hydrateEnrollment(created, credential);
      this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.enrolled, {
        blueprintId: enrollment.blueprintId,
        blueprintVersion: enrollment.blueprintVersion,
        brandId: enrollment.brandId,
        credentialId: enrollment.credentialId,
        enrollmentId: enrollment.id,
        organizationId: enrollment.organizationId,
        platform,
        state: enrollment.state,
      });
      return this.advanceEnrollmentJourney(enrollment, context);
    } catch (error) {
      if (!isEnrollmentUniqueViolation(error)) {
        throw error;
      }

      const concurrent = await this.prisma.socialWarmupEnrollment.findFirst({
        include: enrollmentInclude,
        where: scopedWhere(context.organizationId, {
          brandId: context.brandId,
          credentialId: credential.id,
        }),
      });
      if (!concurrent) {
        throw error;
      }
      return this.hydrateEnrollment(concurrent, credential);
    }
  }

  async findAllScoped(
    context: SocialWarmupScope,
    query: SocialWarmupEnrollmentsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = scopedWhere(context.organizationId, {
      brandId: context.brandId,
      ...(query.credential ? { credentialId: query.credential } : {}),
    });
    const [docs, total] = await Promise.all([
      this.prisma.socialWarmupEnrollment.findMany({
        include: enrollmentInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialWarmupEnrollment.count({ where }),
    ]);
    const credentials = await this.prisma.credential.findMany({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: { in: docs.map((doc) => doc.credentialId) },
      }),
    });
    const credentialById = new Map(
      credentials.map((credential) => [credential.id, credential]),
    );

    return {
      docs: await Promise.all(
        docs.map((doc) =>
          this.hydrateEnrollment(doc, credentialById.get(doc.credentialId)),
        ),
      ),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const enrollment = await this.requireEnrollment(id, context);
    return this.advanceEnrollmentJourney(enrollment, context);
  }

  async completeItemScoped(
    id: string,
    itemId: string,
    dto: CompleteSocialWarmupItemDto,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    return this.appendItemEvent(
      id,
      itemId,
      SocialWarmupEventAction.COMPLETED,
      dto.provenance,
      context,
    );
  }

  async reopenItemScoped(
    id: string,
    itemId: string,
    dto: CompleteSocialWarmupItemDto,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    return this.appendItemEvent(
      id,
      itemId,
      SocialWarmupEventAction.REOPENED,
      dto.provenance,
      context,
    );
  }

  async upsertSignalScoped(
    id: string,
    dto: UpsertSocialWarmupSignalDto,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const enrollment = await this.requireEnrollment(id, context);
    await this.upsertSignalRow({
      brandId: enrollment.brandId,
      enrollmentId: enrollment.id,
      evidence: dto.evidence,
      key: dto.key,
      observedAt: dto.observedAt,
      organizationId: enrollment.organizationId,
      source: dto.source,
      staleAt: dto.staleAt,
      status: dto.status,
    });
    this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.signalsRefreshed, {
      brandId: enrollment.brandId,
      credentialId: enrollment.credentialId,
      enrollmentId: enrollment.id,
      key: dto.key,
      organizationId: enrollment.organizationId,
      source: dto.source,
      status: dto.status,
    });
    const next = await this.requireEnrollment(id, context);
    return this.advanceEnrollmentJourney(next, context);
  }

  async syncPlatformSnapshot(
    params: SyncSocialWarmupPlatformSnapshotInput,
  ): Promise<void> {
    const enrollment = await this.prisma.socialWarmupEnrollment.findFirst({
      where: scopedWhere(params.organizationId, {
        brandId: params.brandId,
        credentialId: params.credentialId,
      }),
    });
    if (!enrollment) {
      return;
    }

    for (const item of params.evidence) {
      await this.upsertSignalRow({
        brandId: enrollment.brandId,
        enrollmentId: enrollment.id,
        evidence: item.evidence,
        key: item.key,
        observedAt: item.observedAt,
        organizationId: enrollment.organizationId,
        source: item.source,
        staleAt: item.staleAt,
        status: item.status,
      });
    }

    this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.signalsRefreshed, {
      brandId: enrollment.brandId,
      credentialId: enrollment.credentialId,
      enrollmentId: enrollment.id,
      keys: params.evidence.map((item) => item.key),
      organizationId: enrollment.organizationId,
      statuses: params.evidence.map((item) => item.status),
    });

    if (!enrollment.blueprintId || !enrollment.blueprintVersion) {
      return;
    }

    const latest = await this.prisma.socialWarmupEnrollment.findFirst({
      include: enrollmentInclude,
      where: scopedWhere(params.organizationId, {
        brandId: enrollment.brandId,
        id: enrollment.id,
      }),
    });
    if (!latest?.blueprintId || !latest.startedAt) {
      return;
    }

    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(params.organizationId, {
        brandId: enrollment.brandId,
        id: enrollment.credentialId,
      }),
    });
    const hydrated = await this.hydrateEnrollment(
      latest,
      credential ?? undefined,
    );
    await this.advanceEnrollmentJourney(hydrated, {
      brandId: enrollment.brandId,
      organizationId: enrollment.organizationId,
      userId: enrollment.enrolledByUserId,
    });
  }

  async syncTikTokAuthorizedSnapshot(params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
    snapshot: TikTokAuthorizedSignalsSnapshot;
  }): Promise<void> {
    await this.syncAuthorizedSnapshot(params);
  }

  async syncInstagramAuthorizedSnapshot(params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
    snapshot: InstagramAuthorizedSignalsSnapshot;
  }): Promise<void> {
    await this.syncAuthorizedSnapshot(params);
  }

  async syncTwitterAuthorizedSnapshot(params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
    snapshot: TwitterAuthorizedSignalsSnapshot;
  }): Promise<void> {
    await this.syncAuthorizedSnapshot(params);
  }

  async syncYoutubeAuthorizedSnapshot(
    params: SyncYoutubeAuthorizedSnapshotParams,
  ): Promise<void> {
    await this.syncAuthorizedSnapshot(params);
  }

  async syncLinkedinAuthorizedSnapshot(params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
    snapshot: LinkedinAuthorizedSignalsSnapshot;
  }): Promise<void> {
    await this.syncAuthorizedSnapshot(params);
  }

  private async syncAuthorizedSnapshot(
    params: SyncAuthorizedSnapshotParams,
  ): Promise<void> {
    await this.syncPlatformSnapshot({
      brandId: params.brandId,
      credentialId: params.credentialId,
      evidence: params.snapshot.evidence.map((item) => ({
        evidence: safeSignalEvidence({
          fieldAvailability: item.fieldAvailability,
          reason: item.reason,
          scope: item.scope,
          value: item.value,
        }),
        key: item.key,
        observedAt: item.observedAt,
        source: mapTikTokSource(item.provenance),
        staleAt: item.staleAt,
        status: mapTikTokStatus(item.status),
      })),
      organizationId: params.organizationId,
    });
  }

  private async appendItemEvent(
    id: string,
    itemId: string,
    action: SocialWarmupEventAction,
    provenance: SocialWarmupEventProvenance | undefined,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const enrollment = await this.requireEnrollment(id, context);
    const blueprint = resolveSocialWarmupBlueprint({
      id: enrollment.blueprintId,
      version: enrollment.blueprintVersion,
    });
    const item = findBlueprintItem(blueprint, itemId);
    if (!item) {
      throw new BadRequestException(
        `Checklist item '${itemId}' is not on blueprint ${blueprint.id}@${blueprint.version}.`,
      );
    }

    await this.prisma.socialWarmupEvent.create({
      data: {
        action,
        actorUserId: context.userId,
        brandId: enrollment.brandId,
        enrollmentId: enrollment.id,
        itemId,
        organizationId: enrollment.organizationId,
        provenance: provenance ?? item.provenance,
      },
    });

    const nextPhaseId = resolvePhaseAfterEvent(blueprint, enrollment, action);
    await this.prisma.socialWarmupEnrollment.update({
      data: {
        currentPhaseId: nextPhaseId,
        state:
          enrollment.state === SocialWarmupEnrollmentState.DISCONNECTED
            ? enrollment.state
            : SocialWarmupEnrollmentState.IN_PROGRESS,
      },
      where: scopedWhere(enrollment.organizationId, {
        brandId: enrollment.brandId,
        id: enrollment.id,
      }),
    });

    this.emitTelemetry(
      action === SocialWarmupEventAction.COMPLETED
        ? SOCIAL_WARMUP_TELEMETRY_EVENT.checkCompleted
        : SOCIAL_WARMUP_TELEMETRY_EVENT.checkReopened,
      {
        action,
        actorUserId: context.userId,
        enrollmentId: enrollment.id,
        itemId,
        organizationId: enrollment.organizationId,
        provenance: provenance ?? item.provenance,
      },
    );

    const next = await this.requireEnrollment(id, context);
    return this.advanceEnrollmentJourney(next, context);
  }

  private async advanceEnrollmentJourney(
    enrollment: SocialWarmupEnrollmentDocument,
    _context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    if (
      !enrollment.blueprintId ||
      !enrollment.blueprintVersion ||
      !enrollment.startedAt
    ) {
      return enrollment;
    }

    let blueprint: SocialWarmupBlueprint;
    try {
      blueprint = resolveSocialWarmupBlueprint({
        id: enrollment.blueprintId,
        version: enrollment.blueprintVersion,
      });
    } catch {
      return enrollment;
    }

    const evaluation = evaluateSocialWarmupJourney({
      blueprint,
      enrollment: {
        completedItemIds: enrollment.completedItemIds,
        hasPartialScopes: enrollment.hasPartialScopes,
        isCredentialConnected: enrollment.isCredentialConnected,
        reconnect: enrollment.reconnect,
        signals: enrollment.signals,
        startedAt: enrollment.startedAt,
        state: enrollment.state,
      },
      platform: blueprint.platform,
    });

    const previousState = enrollment.state;
    let nextState = previousState;
    if (!enrollment.isCredentialConnected) {
      nextState = SocialWarmupEnrollmentState.DISCONNECTED;
    } else if (evaluation.isGraduated) {
      nextState = SocialWarmupEnrollmentState.GRADUATED;
    } else if (previousState === SocialWarmupEnrollmentState.GRADUATED) {
      nextState = SocialWarmupEnrollmentState.IN_PROGRESS;
    } else if (previousState === SocialWarmupEnrollmentState.DISCONNECTED) {
      nextState = SocialWarmupEnrollmentState.IN_PROGRESS;
    }

    if (nextState === previousState) {
      return enrollment;
    }

    await this.prisma.socialWarmupEnrollment.update({
      data: { state: nextState },
      where: scopedWhere(enrollment.organizationId, {
        brandId: enrollment.brandId,
        id: enrollment.id,
      }),
    });

    this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.readinessTransition, {
      enrollmentId: enrollment.id,
      from: previousState,
      organizationId: enrollment.organizationId,
      surface: 'enrollment',
      to: nextState,
    });
    if (nextState === SocialWarmupEnrollmentState.GRADUATED) {
      this.emitTelemetry(SOCIAL_WARMUP_TELEMETRY_EVENT.graduated, {
        blueprintId: enrollment.blueprintId,
        elapsedDays: evaluation.elapsedDays,
        enrollmentId: enrollment.id,
        organizationId: enrollment.organizationId,
      });
    }

    return {
      ...enrollment,
      state: nextState,
    };
  }

  private emitTelemetry(event: string, payload: Record<string, unknown>): void {
    this.logger?.log(event, sanitizeSocialWarmupTelemetry(payload));
  }

  private async requireEnrollment(
    id: string,
    context: SocialWarmupScope,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const enrollment = await this.prisma.socialWarmupEnrollment.findFirst({
      include: enrollmentInclude,
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id,
      }),
    });
    if (!enrollment) {
      throw new NotFoundException('SocialWarmupEnrollment', id);
    }

    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: enrollment.credentialId,
      }),
    });
    return this.hydrateEnrollment(enrollment, credential ?? undefined);
  }

  private async requireCredential(
    credentialId: string,
    context: SocialWarmupScope,
  ) {
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: credentialId,
      }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', credentialId);
    }
    return credential;
  }

  private async hydrateEnrollment(
    enrollment: {
      blueprintId: string;
      blueprintVersion: number;
      brandId: string;
      createdAt?: Date;
      credentialId: string;
      currentPhaseId: string;
      enrolledByUserId: string;
      events?: StoredSocialWarmupEventRecord[];
      id: string;
      isDeleted?: boolean;
      organizationId: string;
      signals?: StoredSocialWarmupSignalRecord[];
      startedAt: Date;
      state: string;
      updatedAt?: Date;
    },
    credential:
      | {
          id: string;
          isConnected: boolean;
          platform: string;
          warmupSignals: unknown;
        }
      | undefined,
  ): Promise<SocialWarmupEnrollmentDocument> {
    const events =
      enrollment.events?.map(socialWarmupEventRecordFromStorage) ?? [];
    const signals =
      enrollment.signals?.map(socialWarmupSignalRecordFromStorage) ?? [];
    const isConnected = credential?.isConnected !== false;
    const hasPartialScopes = hasPartialSocialWarmupScopes(
      credential?.warmupSignals,
    );
    let state = socialWarmupEnrollmentStateFromStorage(enrollment.state);

    if (credential && !credential.isConnected) {
      state = SocialWarmupEnrollmentState.DISCONNECTED;
      await this.prisma.$transaction([
        this.prisma.socialWarmupEnrollment.update({
          data: { state: SocialWarmupEnrollmentState.DISCONNECTED },
          where: scopedWhere(enrollment.organizationId, {
            brandId: enrollment.brandId,
            id: enrollment.id,
          }),
        }),
        this.prisma.socialWarmupSignal.updateMany({
          data: {
            staleAt: new Date(),
            status: SocialWarmupSignalStatus.STALE,
          },
          where: scopedWhere(enrollment.organizationId, {
            brandId: enrollment.brandId,
            enrollmentId: enrollment.id,
            source: SocialWarmupSignalSource.PLATFORM,
          }),
        }),
      ]);
    }

    return {
      blueprintId: enrollment.blueprintId,
      blueprintVersion: enrollment.blueprintVersion,
      brandId: enrollment.brandId,
      completedItemIds: completedItemIdsFromEvents(events),
      createdAt: enrollment.createdAt ?? enrollment.startedAt,
      credentialId: enrollment.credentialId,
      currentPhaseId: enrollment.currentPhaseId,
      enrolledByUserId: enrollment.enrolledByUserId,
      events,
      hasPartialScopes,
      id: enrollment.id,
      isCredentialConnected: isConnected,
      isDeleted: enrollment.isDeleted ?? false,
      organizationId: enrollment.organizationId,
      reconnect: reconnectForCredential({
        credentialId: enrollment.credentialId,
        hasPartialScopes,
        isConnected,
        platform: credential?.platform,
      }),
      signals: signals.map((signal) =>
        !isConnected && signal.source === SocialWarmupSignalSource.PLATFORM
          ? { ...signal, status: SocialWarmupSignalStatus.STALE }
          : signal,
      ),
      startedAt: enrollment.startedAt,
      state,
      updatedAt: enrollment.updatedAt ?? enrollment.startedAt,
    };
  }

  private signalCreatesFromCredential(credential: {
    platform?: string;
    warmupSignals: unknown;
  }): Prisma.SocialWarmupSignalUncheckedCreateWithoutEnrollmentInput[] {
    return authorizedEvidenceFromWarmupSignals(credential.warmupSignals).map(
      (record) => ({
        evidence: toPrismaJson(
          safeSignalEvidence({
            fieldAvailability: record.fieldAvailability,
            reason: record.reason,
            scope: record.scope,
            value: record.value,
          }),
        ),
        key: String(record.key),
        observedAt:
          typeof record.observedAt === 'string'
            ? new Date(record.observedAt)
            : undefined,
        source: mapTikTokSource(
          typeof record.provenance === 'string' ? record.provenance : undefined,
        ),
        staleAt:
          typeof record.staleAt === 'string'
            ? new Date(record.staleAt)
            : undefined,
        status: mapTikTokStatus(
          typeof record.status === 'string' ? record.status : undefined,
        ),
      }),
    );
  }

  private async upsertSignalRow(params: {
    brandId: string;
    enrollmentId: string;
    evidence?: Record<string, unknown>;
    key: string;
    observedAt?: string | null;
    organizationId: string;
    source: SocialWarmupSignalSource;
    staleAt?: string | null;
    status: SocialWarmupSignalStatus;
  }): Promise<void> {
    const evidence = safeSignalEvidence(params.evidence);
    const observedAt = params.observedAt ? new Date(params.observedAt) : null;
    const staleAt = params.staleAt ? new Date(params.staleAt) : null;
    const existing = await this.prisma.socialWarmupSignal.findFirst({
      where: scopedWhere(params.organizationId, {
        brandId: params.brandId,
        enrollmentId: params.enrollmentId,
        key: params.key,
      }),
    });

    if (existing) {
      await this.prisma.socialWarmupSignal.update({
        data: {
          evidence: toPrismaJson(evidence),
          observedAt,
          source: params.source,
          staleAt,
          status: params.status,
        },
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          id: existing.id,
        }),
      });
      return;
    }

    try {
      await this.prisma.socialWarmupSignal.create({
        data: {
          brandId: params.brandId,
          enrollmentId: params.enrollmentId,
          evidence: toPrismaJson(evidence),
          key: params.key,
          observedAt,
          organizationId: params.organizationId,
          source: params.source,
          staleAt,
          status: params.status,
        },
      });
    } catch (error) {
      if (!isSignalUniqueViolation(error)) {
        throw error;
      }
    }
  }
}

function findBlueprintItem(
  blueprint: SocialWarmupBlueprint,
  itemId: string,
): { id: string; provenance: SocialWarmupEventProvenance } | undefined {
  for (const phase of blueprint.phases) {
    const step = phase.steps.find((candidate) => candidate.id === itemId);
    if (step) {
      return step;
    }
  }
  return blueprint.graduation.rules.find((rule) => rule.id === itemId);
}

function resolvePhaseAfterEvent(
  blueprint: SocialWarmupBlueprint,
  enrollment: { currentPhaseId: string },
  action: SocialWarmupEventAction,
): string {
  if (action === SocialWarmupEventAction.REOPENED) {
    return enrollment.currentPhaseId;
  }
  const currentIndex = blueprint.phases.findIndex(
    (phase) => phase.id === enrollment.currentPhaseId,
  );
  if (currentIndex < 0) {
    return blueprint.phases[0]?.id ?? enrollment.currentPhaseId;
  }
  return enrollment.currentPhaseId;
}
