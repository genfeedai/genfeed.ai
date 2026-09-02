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
  deriveReleaseStatusProjectionFromTargets,
  type ReleaseAttachmentInput,
  type ReleaseMediaReferenceInput,
  resolvePostVisibility,
  type UpdateChannelTargetInput,
  type UpdateReleaseGroupInput,
  updateChannelTargetSchema,
  updateReleaseGroupSchema,
} from '@api-types/contracts/scheduler.contract';
import { getSchedulerAnalyticsCapability } from '@api-types/contracts/scheduler-analytics-collection.contract';
import { buildReleaseAnalyticsComparison } from '@api-types/contracts/scheduler-analytics-comparison.contract';
import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type {
  IChannelTarget,
  IChannelTargetAnalyticsCollection,
  IChannelTargetAnalyticsCollectionError,
  IPublishingProviderReadiness,
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
  Logger,
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

const REPUBLISH_SKIP_TARGET_STATES = new Set<string>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.SKIPPED,
]);

@Injectable()
export class PostGroupContractService {
  private readonly logger = new Logger(PostGroupContractService.name);

  toPostVisibility(visibility: string | null) {
    return resolvePostVisibility(visibility);
  }

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
      caption: this.readTargetCaption(target.caption, input.baseContent),
      credentialId: target.credentialId,
      media: this.toValidationMedia(input.media),
      platform: target.platform,
      publishMode,
      settings: target.settings ?? {},
      visibility: target.visibility,
    });
  }

  readTargetCaption(caption: string | undefined, baseContent: string): string {
    const override = caption?.trim();
    return override && override.length > 0 ? override : baseContent;
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
      input.settings !== undefined || input.visibility !== undefined
        ? validateChannelTargetSettings({
            credentialId: existing.credentialId,
            platform: existing.platform,
            publishMode:
              existing.targetExecutionState === TargetExecutionState.DRAFT
                ? 'draft'
                : existing.scheduledDate
                  ? 'scheduled'
                  : undefined,
            settings: input.settings,
            visibility: input.visibility ?? existing.visibility ?? undefined,
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
    const releaseTargets = targets.map((target) =>
      this.toChannelTarget(target, group, analyticsByTarget.get(target.id)),
    );
    const status = this.deriveReleaseStatus(
      group.id,
      targets.map((target) => target.targetExecutionState),
    );

    return {
      analyticsComparison: buildReleaseAnalyticsComparison(
        group.id,
        releaseTargets,
      ),
      attachments: this.asReleaseAttachments(group.attachments, group.id),
      baseContent: group.baseContent,
      brandId: group.brandId,
      campaignId: group.campaignId,
      createdAt: group.createdAt.toISOString(),
      firstTagColor: this.firstTagColorFromTargets(targets),
      id: group.id,
      idempotencyKey: group.idempotencyKey,
      isDeleted: group.isDeleted,
      media: this.asMedia(group.media),
      organizationId: group.organizationId,
      ownerId: group.ownerId,
      postingSetId: group.postingSetId,
      publishedAt: this.toIso(group.publishedAt),
      rssFeedItemId: group.rssFeedItemId,
      rssSourceId: group.rssSourceId,
      recurrence: this.asRecurrence(group.recurrence),
      scheduledAt: this.toIso(group.scheduledAt),
      status,
      statusTransitions: this.asTransitions(group.statusTransitions),
      targetSummary: this.summarizeTargets(targets),
      targets: releaseTargets,
      timezone: group.timezone,
      title: group.title,
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  /** First tag on the first target post. Later targets and tags are ignored. */
  private firstTagColorFromTargets(
    targets: readonly SchedulerPostTarget[],
  ): string | null {
    const firstTag = targets[0]?.tags?.find((tag) => tag.isDeleted !== true);
    const color = firstTag?.backgroundColor?.trim();
    return color ? color : null;
  }

  deriveReleaseStatus(
    releaseId: string,
    targetStates: readonly unknown[],
  ): ReleaseStatus {
    const projection = deriveReleaseStatusProjectionFromTargets(targetStates);
    for (const diagnostic of projection.diagnostics) {
      this.logger.warn('Release status derivation failed closed', {
        ...diagnostic,
        releaseId,
      });
    }
    return projection.status;
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

  /**
   * Map a release-group status onto the legacy `posts.status` String column
   * (`PostStatus` lowercase product language).
   *
   * Never passthrough: `ReleaseStatus` values like `paused` / `cancelled` /
   * `publishing` are not in `PostStatus` and must not land on `posts.status`.
   * Target-level truth stays on `targetExecutionState` via {@link toTargetState}.
   */
  toPostStatus(status: string): PostStatus {
    switch (status) {
      case ReleaseStatus.DRAFT:
      case PostStatus.DRAFT:
      // The legacy vocabulary has no paused/cancelled members: draft keeps
      // these targets out of the publish sweep, while targetExecutionState
      // preserves the precise state.
      case ReleaseStatus.PAUSED:
      case ReleaseStatus.CANCELLED:
        return PostStatus.DRAFT;
      case ReleaseStatus.PUBLISHING:
      case PostStatus.PENDING:
      case PostStatus.PROCESSING:
        return PostStatus.PROCESSING;
      case ReleaseStatus.PUBLISHED:
      case PostStatus.PUBLIC:
        return PostStatus.PUBLIC;
      case ReleaseStatus.FAILED:
      case PostStatus.FAILED:
        return PostStatus.FAILED;
      case PostStatus.PRIVATE:
        return PostStatus.PRIVATE;
      case PostStatus.UNLISTED:
        return PostStatus.UNLISTED;
      default:
        // Scheduled, aggregate-only, and unknown release values stay in the
        // legacy scheduled bucket; targetExecutionState retains exact state.
        return PostStatus.SCHEDULED;
    }
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
      (provenance?.workflowExecutionId === undefined ||
        target.workflowExecutionId === provenance.workflowExecutionId) &&
      (provenance?.agentStrategyId === undefined ||
        target.agentStrategyId === provenance.agentStrategyId) &&
      (provenance?.agentThreadId === undefined ||
        target.agentThreadId === provenance.agentThreadId)
    );
  }

  parseScheduleDate(value: string): Date {
    if (!STRICT_SCHEDULE_DATE_SCHEMA.safeParse(value).success) {
      throw new BadRequestException(
        'scheduledAt must be a valid ISO 8601 date and time with an explicit UTC offset.',
      );
    }
    return new Date(value);
  }

  parseFutureScheduleDate(value: string): Date {
    const date = this.parseScheduleDate(value);
    if (date.getTime() < Date.now() - 1000) {
      throw new BadRequestException(
        'scheduledAt must be now or in the future.',
      );
    }
    return date;
  }

  readScheduledDate(body: unknown): string {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return '';
    }
    const value = (body as Record<string, unknown>).scheduledDate;
    return typeof value === 'string' ? value : '';
  }

  hasPublishedTarget(targets: readonly SchedulerPostTarget[]): boolean {
    return targets.some(
      (target) =>
        target.targetExecutionState === TargetExecutionState.PUBLISHED,
    );
  }

  /**
   * Clone a live release into a new scheduled create payload. Recurrence is
   * omitted on purpose — evergreen series edits stay on #1130.
   */
  buildRepublishCreateInput(
    group: SchedulerPostGroup,
    targets: readonly SchedulerPostTarget[],
    scheduledDate: string,
  ): CreateReleaseGroupInput {
    const cloneable = targets.filter(
      (target) =>
        !REPUBLISH_SKIP_TARGET_STATES.has(target.targetExecutionState),
    );
    if (cloneable.length === 0) {
      throw new BadRequestException(
        'This release has no channel that can be published again.',
      );
    }

    const media = this.asMedia(group.media).map((item) => ({
      assetId: item.assetId,
      ...(item.kind ? { kind: item.kind } : {}),
      ...(item.order !== undefined ? { order: item.order } : {}),
    }));
    const attachments = this.asReleaseAttachments(group.attachments, group.id)
      .filter((attachment) => !attachment.targetId)
      .map((attachment) => ({
        body: attachment.body,
        kind: attachment.kind,
        order: attachment.order,
        ...(attachment.platform ? { platform: attachment.platform } : {}),
      }));

    return {
      ...(attachments.length > 0 ? { attachments } : {}),
      baseContent: group.baseContent,
      ...(group.brandId ? { brandId: group.brandId } : {}),
      ...(media.length > 0 ? { media } : {}),
      scheduledDate,
      status: ReleaseStatus.SCHEDULED,
      targets: cloneable.map((target, index) =>
        this.toRepublishTargetInput(group, target, scheduledDate, index),
      ),
      timezone: group.timezone,
      title: group.title,
    };
  }

  private toRepublishTargetInput(
    group: SchedulerPostGroup,
    target: SchedulerPostTarget,
    scheduledDate: string,
    index: number,
  ): ChannelTargetInput {
    const caption = this.readTargetCaption(
      target.description,
      group.baseContent,
    );
    const settings = this.asRecord(target.targetSettings);
    const attachments = this.asReleaseAttachments(
      target.targetAttachments,
      group.id,
      target.id,
    ).map((attachment) => ({
      body: attachment.body,
      kind: attachment.kind,
      order: attachment.order,
      ...(attachment.platform ? { platform: attachment.platform } : {}),
    }));

    return {
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(caption !== group.baseContent ? { caption } : {}),
      credentialId: target.credentialId,
      order: target.order ?? index,
      platform: this.parseCredentialPlatform(target.platform),
      scheduledDate,
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
      timezone: target.timezone || group.timezone,
      visibility: this.toPostVisibility(target.visibility),
    };
  }

  toDate(value: string | undefined | null): Date | null {
    return value ? new Date(value) : null;
  }

  toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  toReadinessJson(
    readiness: IPublishingProviderReadiness | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return readiness ? this.toJson(readiness) : Prisma.JsonNull;
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
      category: target.category ?? PostCategory.TEXT,
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
      visibility: resolvePostVisibility(target.visibility),
      source: this.toTargetSource(target),
      timezone: target.timezone,
      updatedAt: target.updatedAt.toISOString(),
      url: target.url,
      validationIssues: target.targetValidationIssues,
      validationState: target.targetValidationState as TargetValidationState,
      workflowExecutionId: target.workflowExecutionId,
    };
  }

  /**
   * Derives the calendar-facing provenance of a target from its durable columns.
   *
   * A durable workflow execution wins over agent provenance because a target
   * placed by an agent and then executed by a workflow is, operationally, a
   * workflow-scheduled item — that is the run an operator would go look at.
   */
  private toTargetSource(target: SchedulerPostTarget): ReleaseTargetSource {
    if (target.workflowExecutionId) {
      return ReleaseTargetSource.WORKFLOW;
    }
    if (
      target.agentThreadId ||
      target.agentStrategyId ||
      target.agentContextSource
    ) {
      return ReleaseTargetSource.AGENT;
    }
    return ReleaseTargetSource.MANUAL;
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

    const exactAnalytics = matchesTarget ? analytics : undefined;
    const collection = this.toTargetAnalyticsCollection(target, exactAnalytics);

    if (!exactAnalytics) {
      return { collection, snapshot: null, state: 'unavailable' };
    }

    return {
      collection,
      snapshot: {
        comments: exactAnalytics.totalComments,
        engagementRate: exactAnalytics.engagementRate,
        likes: exactAnalytics.totalLikes,
        saves: exactAnalytics.totalSaves,
        shares: exactAnalytics.totalShares,
        snapshotDate: exactAnalytics.date.toISOString(),
        updatedAt: exactAnalytics.updatedAt.toISOString(),
        views: exactAnalytics.totalViews,
      },
      state: 'ready',
    };
  }

  private toTargetAnalyticsCollection(
    target: SchedulerPostTarget,
    analytics: SchedulerPostAnalytics | undefined,
  ): IChannelTargetAnalyticsCollection {
    const capability = getSchedulerAnalyticsCapability(target.platform);
    const lastCollectedAt =
      target.analyticsCollectedAt ?? analytics?.updatedAt ?? null;
    const freshness = this.analyticsFreshness(
      lastCollectedAt,
      capability.freshnessWindowMs,
    );

    if (capability.status === TargetAnalyticsCapability.UNSUPPORTED) {
      return {
        capability: capability.status,
        error: null,
        freshness: TargetAnalyticsFreshness.UNAVAILABLE,
        lastCollectedAt: null,
        requestedAt: null,
        state: TargetAnalyticsCollectionState.UNAVAILABLE,
      };
    }

    const persistedState = this.analyticsCollectionState(
      target.analyticsCollectionState,
    );
    const state =
      persistedState === TargetAnalyticsCollectionState.PENDING ||
      persistedState === TargetAnalyticsCollectionState.FAILED
        ? persistedState
        : freshness === TargetAnalyticsFreshness.FRESH
          ? TargetAnalyticsCollectionState.READY
          : freshness === TargetAnalyticsFreshness.STALE
            ? TargetAnalyticsCollectionState.STALE
            : TargetAnalyticsCollectionState.UNAVAILABLE;

    return {
      capability: capability.status,
      error:
        state === TargetAnalyticsCollectionState.FAILED
          ? this.asAnalyticsCollectionError(target.analyticsCollectionError)
          : null,
      freshness,
      lastCollectedAt: this.toIso(lastCollectedAt),
      requestedAt: this.toIso(target.analyticsCollectionRequestedAt),
      state,
    };
  }

  private analyticsFreshness(
    collectedAt: Date | null,
    freshnessWindowMs: number | null,
  ): TargetAnalyticsFreshness {
    if (!collectedAt || freshnessWindowMs === null) {
      return TargetAnalyticsFreshness.UNAVAILABLE;
    }
    return Date.now() - collectedAt.getTime() > freshnessWindowMs
      ? TargetAnalyticsFreshness.STALE
      : TargetAnalyticsFreshness.FRESH;
  }

  private analyticsCollectionState(
    value: string,
  ): TargetAnalyticsCollectionState {
    return Object.values(TargetAnalyticsCollectionState).includes(
      value as TargetAnalyticsCollectionState,
    )
      ? (value as TargetAnalyticsCollectionState)
      : TargetAnalyticsCollectionState.UNAVAILABLE;
  }

  private asAnalyticsCollectionError(
    value: Prisma.JsonValue | null,
  ): IChannelTargetAnalyticsCollectionError | null {
    const record = this.asRecord(value);
    return typeof record.code === 'string' &&
      typeof record.failedAt === 'string' &&
      typeof record.isRetryable === 'boolean' &&
      typeof record.message === 'string'
      ? {
          code: record.code,
          failedAt: record.failedAt,
          isRetryable: record.isRetryable,
          message: record.message,
        }
      : null;
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
