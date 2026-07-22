import type {
  SchedulerPostAnalytics,
  SchedulerPostGroup,
  SchedulerPostTarget,
} from '@api/collections/post-groups/services/post-group.types';
import {
  type ChannelTargetValidationResult,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import {
  type ChannelTargetInput,
  type CreateReleaseGroupInput,
  createReleaseGroupSchema,
  type ReleaseAttachmentInput,
  type ReleaseMediaReferenceInput,
  type UpdateChannelTargetInput,
  type UpdateReleaseGroupInput,
  updateChannelTargetSchema,
  updateReleaseGroupSchema,
} from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  PostStatus,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type {
  IChannelTarget,
  IReleaseAttachment,
  IReleaseGroup,
  IReleaseMediaReference,
  IReleaseTargetSummary,
  IScheduleStatusTransition,
  PostGroupCreateProvenance,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { type ZodError, z } from 'zod';

type ChannelValidationMedia = NonNullable<
  Parameters<typeof validateChannelTargetSettings>[0]['media']
>;

const CREATE_ALLOWED_STATUSES = new Set<string>([
  ReleaseStatus.DRAFT,
  ReleaseStatus.SCHEDULED,
]);

const STRICT_SCHEDULE_DATE_SCHEMA = z.string().datetime({ offset: true });

const SCHEDULABLE_TARGET_STATES = new Set<string>([
  TargetExecutionState.DRAFT,
  TargetExecutionState.PAUSED,
  TargetExecutionState.SCHEDULED,
]);

@Injectable()
export class PostGroupContractService {
  parseCreateInput(
    body: unknown,
    headerIdempotencyKey?: string,
  ): CreateReleaseGroupInput {
    const idempotencyKey = headerIdempotencyKey?.trim();
    const payload =
      idempotencyKey && typeof body === 'object' && body !== null
        ? { ...body, idempotencyKey }
        : body;
    const parsed = createReleaseGroupSchema.safeParse(payload);
    if (!parsed.success) {
      throw this.badRequestFromZod(parsed.error);
    }
    return parsed.data;
  }

  parseUpdateInput(body: unknown): UpdateReleaseGroupInput {
    const parsed = updateReleaseGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequestFromZod(parsed.error);
    }
    return parsed.data;
  }

  parseTargetInput(body: unknown): UpdateChannelTargetInput {
    const parsed = updateChannelTargetSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequestFromZod(parsed.error);
    }
    return parsed.data;
  }

  resolveCreateStatus(input: CreateReleaseGroupInput): ReleaseStatus {
    const status =
      input.status ??
      (input.scheduledDate ||
      input.targets.some((target) => Boolean(target.scheduledDate))
        ? ReleaseStatus.SCHEDULED
        : ReleaseStatus.DRAFT);

    if (!CREATE_ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Release groups can only be created as ${ReleaseStatus.DRAFT} or ${ReleaseStatus.SCHEDULED}.`,
      );
    }

    return status;
  }

  validateTarget(
    input: Pick<CreateReleaseGroupInput, 'baseContent' | 'media'>,
    target: ChannelTargetInput,
    publishMode: 'draft' | 'publish_now' | 'scheduled',
  ): ChannelTargetValidationResult {
    return validateChannelTargetSettings({
      caption: input.baseContent,
      credentialId: target.credentialId,
      media: this.toValidationMedia(input.media),
      platform: target.platform,
      publishMode,
      settings: target.settings ?? {},
    });
  }

  invalidTargetException(
    target: Pick<ChannelTargetInput, 'credentialId' | 'platform'>,
    validation: ChannelTargetValidationResult,
  ): BadRequestException {
    const detail = [...validation.errors, ...validation.warnings]
      .map((issue) => issue.message)
      .join('; ');
    return new BadRequestException({
      detail:
        detail ||
        `Target ${target.credentialId} on ${target.platform} failed validation.`,
      title: 'Invalid channel target',
    });
  }

  assertSchedulableTarget(
    group: SchedulerPostGroup,
    target: SchedulerPostTarget,
  ): asserts group is SchedulerPostGroup & { brandId: string } {
    if (!SCHEDULABLE_TARGET_STATES.has(target.targetExecutionState)) {
      throw new ConflictException(
        `Channel target cannot be scheduled from ${target.targetExecutionState}.`,
      );
    }
    if (!group.brandId) {
      throw new BadRequestException(
        'Canonical release target is missing a brand assignment.',
      );
    }
    if (target.brandId !== group.brandId) {
      throw new BadRequestException(
        'Channel target brand does not match its canonical release.',
      );
    }
  }

  validateTargetUpdate(
    existing: SchedulerPostTarget,
    input: UpdateChannelTargetInput,
  ): ChannelTargetValidationResult | undefined {
    const validation =
      input.settings !== undefined
        ? validateChannelTargetSettings({
            credentialId: existing.credentialId,
            platform: existing.platform,
            settings: input.settings,
          })
        : undefined;

    if (
      validation &&
      !validation.valid &&
      input.executionState !== TargetExecutionState.DRAFT
    ) {
      throw this.invalidTargetException(
        {
          credentialId: existing.credentialId,
          platform: existing.platform as CredentialPlatform,
        },
        validation,
      );
    }

    return validation;
  }

  toReleaseGroup(
    group: SchedulerPostGroup,
    targets: readonly SchedulerPostTarget[],
    analyticsByTarget: ReadonlyMap<string, SchedulerPostAnalytics> = new Map(),
  ): IReleaseGroup {
    return {
      attachments: this.asReleaseAttachments(group.attachments, group.id),
      baseContent: group.baseContent,
      brandId: group.brandId,
      createdAt: group.createdAt.toISOString(),
      id: group.id,
      idempotencyKey: group.idempotencyKey,
      isDeleted: group.isDeleted,
      media: this.asMedia(group.media),
      organizationId: group.organizationId,
      ownerId: group.ownerId,
      publishedAt: this.toIso(group.publishedAt),
      recurrence: this.asRecurrence(group.recurrence),
      scheduledAt: this.toIso(group.scheduledAt),
      status: group.status as ReleaseStatus,
      statusTransitions: this.asTransitions(group.statusTransitions),
      targetSummary: this.summarizeTargets(targets),
      targets: targets.map((target) =>
        this.toChannelTarget(target, group, analyticsByTarget.get(target.id)),
      ),
      timezone: group.timezone,
      title: group.title,
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  appendTransition(
    raw: Prisma.JsonValue,
    from: string | null,
    to: string,
    actorId: string,
  ): Prisma.InputJsonValue {
    return this.toJson([
      ...this.asTransitions(raw),
      this.buildTransition(from, to, actorId),
    ]);
  }

  buildTransition(
    from: string | null,
    to: string,
    actorId: string,
  ): IScheduleStatusTransition {
    return {
      actorId,
      at: new Date().toISOString(),
      from,
      to,
    };
  }

  validationIssues(validation: ChannelTargetValidationResult): string[] {
    return [...validation.errors, ...validation.warnings].map(
      (issue) => issue.message,
    );
  }

  toTargetState(status: string): TargetExecutionState {
    switch (status) {
      case ReleaseStatus.DRAFT:
        return TargetExecutionState.DRAFT;
      case ReleaseStatus.PAUSED:
        return TargetExecutionState.PAUSED;
      case ReleaseStatus.CANCELLED:
        return TargetExecutionState.CANCELLED;
      case ReleaseStatus.PUBLISHING:
        return TargetExecutionState.PUBLISHING;
      case ReleaseStatus.PUBLISHED:
        return TargetExecutionState.PUBLISHED;
      case ReleaseStatus.FAILED:
        return TargetExecutionState.FAILED;
      default:
        return TargetExecutionState.SCHEDULED;
    }
  }

  toPostStatus(status: string): string {
    if (status === ReleaseStatus.DRAFT) {
      return PostStatus.DRAFT;
    }
    if (status === ReleaseStatus.FAILED) {
      return PostStatus.FAILED;
    }
    if (status === ReleaseStatus.PUBLISHED) {
      return PostStatus.PUBLIC;
    }
    return status;
  }

  parseCredentialPlatform(value: string): CredentialPlatform {
    const platform = Object.values(CredentialPlatform).find(
      (candidate) => candidate === value.toLowerCase(),
    );
    if (!platform) {
      throw new BadRequestException(
        `Channel target platform ${value} is not supported.`,
      );
    }
    return platform;
  }

  matchesScheduleProvenance(
    target: SchedulerPostTarget,
    provenance: PostGroupCreateProvenance | undefined,
  ): boolean {
    return (
      (provenance?.agentContextSource === undefined ||
        target.agentContextSource === provenance.agentContextSource) &&
      (provenance?.agentContextVersion === undefined ||
        target.agentContextVersion === provenance.agentContextVersion) &&
      (provenance?.agentRunId === undefined ||
        target.agentRunId === provenance.agentRunId) &&
      (provenance?.agentStrategyId === undefined ||
        target.agentStrategyId === provenance.agentStrategyId) &&
      (provenance?.agentThreadId === undefined ||
        target.agentThreadId === provenance.agentThreadId)
    );
  }

  parseFutureScheduleDate(value: string): Date {
    if (!STRICT_SCHEDULE_DATE_SCHEMA.safeParse(value).success) {
      throw new BadRequestException(
        'scheduledAt must be a valid ISO 8601 date and time with an explicit UTC offset.',
      );
    }
    const date = new Date(value);
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future.');
    }
    return date;
  }

  toDate(value: string | undefined | null): Date | null {
    return value ? new Date(value) : null;
  }

  toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  toValidationMedia(
    media:
      | readonly {
          assetId: string;
          kind?: string | null;
        }[]
      | undefined,
  ): ChannelValidationMedia | undefined {
    if (!media?.length) {
      return undefined;
    }
    return media
      .filter((item) => this.isValidationMediaKind(item.kind))
      .map((item) => {
        const kind = item.kind as ChannelValidationMedia[number]['kind'];
        return item.assetId ? { id: item.assetId, kind } : { kind };
      });
  }

  buildIngredientConnect(
    media: readonly ReleaseMediaReferenceInput[] | undefined,
  ): { connect: Array<{ id: string }> } | undefined {
    if (!media?.length) {
      return undefined;
    }
    return {
      connect: media.map((item) => ({ id: item.assetId })),
    };
  }

  asMedia(value: Prisma.JsonValue): IReleaseMediaReference[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => this.isReleaseMediaReference(item))
      .map((item) => item as unknown as IReleaseMediaReference);
  }

  asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private badRequestFromZod(error: ZodError): BadRequestException {
    return new BadRequestException({
      detail: error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
      title: 'Invalid scheduler mutation payload',
    });
  }

  private toChannelTarget(
    target: SchedulerPostTarget,
    group: SchedulerPostGroup,
    analytics: SchedulerPostAnalytics | undefined,
  ): IChannelTarget {
    return {
      analytics: this.toTargetAnalytics(target, group, analytics),
      attachments: this.asReleaseAttachments(
        target.targetAttachments,
        group.id,
        target.id,
      ),
      createdAt: target.createdAt.toISOString(),
      credentialId: target.credentialId,
      error: this.asTargetError(target.targetError),
      executionState: target.targetExecutionState as TargetExecutionState,
      externalProviderId: target.externalId,
      externalShortcode: target.externalShortcode,
      id: target.id,
      idempotencyKey: target.targetIdempotencyKey,
      isDeleted: target.isDeleted,
      lastAttemptAt: this.toIso(target.lastAttemptAt),
      order: target.order,
      platform: target.platform as CredentialPlatform,
      publishedAt: this.toIso(target.publishedAt),
      readiness: this.asReadiness(target.targetReadiness),
      releaseId: group.id,
      retryCount: target.retryCount,
      scheduledAt: this.toIso(target.scheduledDate),
      settings: this.asRecord(target.targetSettings),
      timezone: target.timezone,
      updatedAt: target.updatedAt.toISOString(),
      url: target.url,
      validationIssues: target.targetValidationIssues,
      validationState: target.targetValidationState as TargetValidationState,
      workflowExecutionId: target.workflowExecutionId,
    };
  }

  private toTargetAnalytics(
    target: SchedulerPostTarget,
    group: SchedulerPostGroup,
    analytics: SchedulerPostAnalytics | undefined,
  ): IChannelTarget['analytics'] {
    const matchesTarget =
      analytics?.postId === target.id &&
      analytics.organizationId === group.organizationId &&
      analytics.brandId === target.brandId &&
      analytics.platform.toLowerCase() === target.platform.toLowerCase();

    if (!analytics || !matchesTarget) {
      return { snapshot: null, state: 'unavailable' };
    }

    return {
      snapshot: {
        comments: analytics.totalComments,
        engagementRate: analytics.engagementRate,
        likes: analytics.totalLikes,
        saves: analytics.totalSaves,
        shares: analytics.totalShares,
        snapshotDate: analytics.date.toISOString(),
        updatedAt: analytics.updatedAt.toISOString(),
        views: analytics.totalViews,
      },
      state: 'ready',
    };
  }

  private summarizeTargets(
    targets: readonly SchedulerPostTarget[],
  ): IReleaseTargetSummary {
    const summary: IReleaseTargetSummary = { total: targets.length };
    for (const target of targets) {
      const state = target.targetExecutionState as TargetExecutionState;
      summary[state] = (summary[state] ?? 0) + 1;
    }
    return summary;
  }

  private toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }

  private isValidationMediaKind(
    kind: string | null | undefined,
  ): kind is ChannelValidationMedia[number]['kind'] {
    return (
      kind === 'carousel' ||
      kind === 'image' ||
      kind === 'link' ||
      kind === 'short_video' ||
      kind === 'video'
    );
  }

  private isReleaseMediaReference(
    value: unknown,
  ): value is IReleaseMediaReference {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).assetId === 'string'
    );
  }

  private asReleaseAttachments(
    value: Prisma.JsonValue,
    releaseId: string,
    targetId?: string,
  ): IReleaseAttachment[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item) => this.isReleaseAttachmentInput(item))
      .map((attachment, index) => ({
        body: attachment.body,
        createdAt: '',
        id: `${releaseId}:${targetId ?? 'release'}:${index}`,
        isDeleted: false,
        kind: attachment.kind,
        order: attachment.order ?? index,
        platform: attachment.platform ?? null,
        releaseId,
        targetId: targetId ?? null,
        updatedAt: '',
      }));
  }

  private isReleaseAttachmentInput(
    value: unknown,
  ): value is ReleaseAttachmentInput {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).body === 'string' &&
      typeof (value as Record<string, unknown>).kind === 'string'
    );
  }

  private asTransitions(value: Prisma.JsonValue): IScheduleStatusTransition[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => this.isTransition(item))
      .map((item) => item as unknown as IScheduleStatusTransition);
  }

  private isTransition(value: unknown): value is IScheduleStatusTransition {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).to === 'string' &&
      typeof (value as Record<string, unknown>).at === 'string'
    );
  }

  private asRecurrence(
    value: Prisma.JsonValue | null,
  ): IReleaseGroup['recurrence'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as unknown as IReleaseGroup['recurrence'];
  }

  private asReadiness(
    value: Prisma.JsonValue | null,
  ): IChannelTarget['readiness'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as unknown as IChannelTarget['readiness'];
  }

  private asTargetError(
    value: Prisma.JsonValue | null,
  ): IChannelTarget['error'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as unknown as IChannelTarget['error'];
  }
}
