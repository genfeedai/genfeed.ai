import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ChannelTargetValidationResult,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import {
  type ChannelTargetInput,
  type CreateReleaseGroupInput,
  createReleaseGroupSchema,
  deriveReleaseStatusFromTargets,
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
  ReleaseAttachmentKind,
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
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { PostPublishQueueService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { ZodError } from 'zod';

type SchedulerTx = Prisma.TransactionClient;

type SchedulerCredential = {
  brandId: string | null;
  id: string;
  isConnected: boolean;
  organizationId: string | null;
  platform: string;
};

type SchedulerPostGroup = {
  attachments: Prisma.JsonValue;
  baseContent: string;
  brandId: string | null;
  createdAt: Date;
  id: string;
  idempotencyKey: string | null;
  isDeleted: boolean;
  media: Prisma.JsonValue;
  organizationId: string;
  ownerId: string;
  publishedAt: Date | null;
  recurrence: Prisma.JsonValue | null;
  scheduledAt: Date | null;
  status: string;
  statusTransitions: Prisma.JsonValue;
  timezone: string;
  title: string;
  updatedAt: Date;
};

type SchedulerPostTarget = {
  createdAt: Date;
  credentialId: string;
  externalId: string | null;
  externalShortcode: string | null;
  groupId: string | null;
  id: string;
  isDeleted: boolean;
  lastAttemptAt: Date | null;
  order: number;
  platform: string;
  publishedAt: Date | null;
  retryCount: number;
  scheduledDate: Date | null;
  targetAttachments: Prisma.JsonValue;
  targetError: Prisma.JsonValue | null;
  targetExecutionState: string;
  targetIdempotencyKey: string | null;
  targetReadiness: Prisma.JsonValue | null;
  targetSettings: Prisma.JsonValue;
  targetValidationIssues: string[];
  targetValidationState: string;
  timezone: string;
  updatedAt: Date;
  url: string | null;
};

type ChannelValidationMedia = NonNullable<
  Parameters<typeof validateChannelTargetSettings>[0]['media']
>;

const CREATE_ALLOWED_STATUSES = new Set<string>([
  ReleaseStatus.DRAFT,
  ReleaseStatus.SCHEDULED,
]);

const GROUP_ACTION_STATES = new Set<string>([
  TargetExecutionState.DRAFT,
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.FAILED,
]);

@Injectable()
export class PostGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postPublishQueueService: PostPublishQueueService,
    private readonly publishApprovalsService: PublishApprovalsService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    body: unknown,
    headerIdempotencyKey?: string,
  ): Promise<IReleaseGroup> {
    const input = this.parseCreateInput(body, headerIdempotencyKey);

    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(
        organizationId,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.status === ReleaseStatus.SCHEDULED) {
          await this.approveReleaseTargets(existing, userId, 'scheduled');
        }
        return existing;
      }
    }

    const status = this.resolveCreateStatus(input);
    const scheduledAt = this.toDate(input.scheduledDate);

    const release = await this.prisma.$transaction(async (tx) => {
      const credentials = await this.resolveCredentials(
        tx,
        organizationId,
        input.targets,
      );
      const brandId = await this.resolveBrandId(
        tx,
        organizationId,
        input.brandId,
        credentials,
      );
      const validations = input.targets.map((target) => {
        const validation = this.validateTarget(
          input,
          target,
          status === ReleaseStatus.DRAFT ? 'draft' : 'scheduled',
        );
        if (!validation.valid && status !== ReleaseStatus.DRAFT) {
          throw this.invalidTargetException(target, validation);
        }
        return validation;
      });
      const transition = this.buildTransition(null, status, userId);
      const group = (await tx.postGroup.create({
        data: {
          attachments: this.toJson(input.attachments ?? []),
          baseContent: input.baseContent,
          brandId,
          idempotencyKey: input.idempotencyKey ?? null,
          media: this.toJson(input.media ?? []),
          organizationId,
          ownerId: userId,
          recurrence: input.recurrence
            ? this.toJson(input.recurrence)
            : Prisma.JsonNull,
          scheduledAt,
          status,
          statusTransitions: this.toJson([transition]),
          timezone: input.timezone,
          title: input.title,
        },
      })) as SchedulerPostGroup;

      const targets: SchedulerPostTarget[] = [];
      for (const [index, target] of input.targets.entries()) {
        const credential = credentials.get(target.credentialId);
        if (!credential) {
          throw new BadRequestException(
            `Credential ${target.credentialId} is not available for this organization.`,
          );
        }

        const validation = validations[index];
        if (!validation) {
          throw new BadRequestException(
            'Missing channel target validation result.',
          );
        }

        const created = (await tx.post.create({
          data: {
            brandId,
            credentialId: target.credentialId,
            description: input.baseContent,
            groupId: group.id,
            ingredients: this.buildIngredientConnect(input.media),
            label: input.title,
            order: target.order ?? index,
            organizationId,
            platform: target.platform,
            scheduledDate:
              this.toDate(target.scheduledDate) ?? group.scheduledAt,
            status: this.toPostStatus(status),
            targetAttachments: this.toJson(target.attachments ?? []),
            targetExecutionState: this.toTargetState(status),
            targetReadiness: validation.readiness
              ? this.toJson(validation.readiness)
              : Prisma.JsonNull,
            targetSettings: this.toJson(target.settings ?? {}),
            targetValidationIssues: this.validationIssues(validation),
            targetValidationState: validation.validationState,
            timezone: target.timezone ?? input.timezone,
            userId,
          },
        })) as SchedulerPostTarget;

        await this.createAttachmentPosts(tx, {
          brandId,
          group,
          input,
          parent: created,
          target,
          userId,
        });

        targets.push(created);
      }

      this.logger.debug('Created scheduler post group', {
        groupId: group.id,
        organizationId,
        targetCount: targets.length,
      });

      return this.toReleaseGroup(group, targets);
    });

    if (release.status === ReleaseStatus.SCHEDULED) {
      await this.approveReleaseTargets(release, userId, 'scheduled');
    }
    return release;
  }

  async getOne(
    organizationId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const group = await this.getGroupOrThrow(
      this.prisma,
      organizationId,
      groupId,
    );
    const targets = await this.getTargets(
      this.prisma,
      organizationId,
      group.id,
    );
    return this.toReleaseGroup(group, targets);
  }

  async update(
    organizationId: string,
    userId: string,
    groupId: string,
    body: unknown,
  ): Promise<IReleaseGroup> {
    const input = this.parseUpdateInput(body);

    const release = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getGroupOrThrow(tx, organizationId, groupId);
      const nextStatus = input.status ?? existing.status;
      const transition =
        nextStatus !== existing.status
          ? this.appendTransition(
              existing.statusTransitions,
              existing.status,
              nextStatus,
              userId,
            )
          : undefined;

      const updated = (await tx.postGroup.update({
        data: {
          ...(input.attachments !== undefined && {
            attachments: this.toJson(input.attachments),
          }),
          ...(input.baseContent !== undefined && {
            baseContent: input.baseContent,
          }),
          ...(input.brandId !== undefined && { brandId: input.brandId }),
          ...(input.media !== undefined && { media: this.toJson(input.media) }),
          ...(input.recurrence !== undefined && {
            recurrence: input.recurrence
              ? this.toJson(input.recurrence)
              : Prisma.JsonNull,
          }),
          ...(input.scheduledDate !== undefined && {
            scheduledAt: this.toDate(input.scheduledDate),
          }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.title !== undefined && { title: input.title }),
          ...(transition !== undefined && { statusTransitions: transition }),
        },
        where: { id: existing.id },
      })) as SchedulerPostGroup;

      const targetUpdate: Record<string, unknown> = {};
      if (input.baseContent !== undefined) {
        targetUpdate.description = input.baseContent;
      }
      if (input.scheduledDate !== undefined) {
        targetUpdate.scheduledDate = this.toDate(input.scheduledDate);
      }
      if (input.timezone !== undefined) {
        targetUpdate.timezone = input.timezone;
      }
      if (input.status !== undefined) {
        targetUpdate.status = this.toPostStatus(input.status);
        targetUpdate.targetExecutionState = this.toTargetState(input.status);
      }

      if (Object.keys(targetUpdate).length > 0) {
        await tx.post.updateMany({
          data: targetUpdate,
          where: {
            groupId: existing.id,
            isDeleted: false,
            organizationId,
            targetExecutionState: { in: Array.from(GROUP_ACTION_STATES) },
          },
        });
      }

      const targets = await this.getTargets(tx, organizationId, existing.id);
      return this.toReleaseGroup(updated, targets);
    });
    if (
      input.attachments !== undefined ||
      input.baseContent !== undefined ||
      input.brandId !== undefined ||
      input.media !== undefined ||
      input.recurrence !== undefined ||
      input.scheduledDate !== undefined ||
      input.timezone !== undefined
    ) {
      await this.invalidateReleaseApprovals(
        release,
        userId,
        'Release content, brand, destinations, or protected schedule intent changed.',
      );
    }
    return release;
  }

  async updateTarget(
    organizationId: string,
    userId: string,
    groupId: string,
    targetId: string,
    body: unknown,
  ): Promise<IReleaseGroup> {
    const input = this.parseTargetInput(body);

    const release = await this.prisma.$transaction(async (tx) => {
      const group = await this.getGroupOrThrow(tx, organizationId, groupId);
      const existing = await this.getTargetOrThrow(
        tx,
        organizationId,
        group.id,
        targetId,
      );

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

      await tx.post.update({
        data: {
          ...(input.error !== undefined && {
            targetError: input.error
              ? this.toJson(input.error)
              : Prisma.JsonNull,
          }),
          ...(input.executionState !== undefined && {
            status: input.executionState,
            targetExecutionState: input.executionState,
          }),
          ...(input.externalProviderId !== undefined && {
            externalId: input.externalProviderId,
          }),
          ...(input.externalShortcode !== undefined && {
            externalShortcode: input.externalShortcode,
          }),
          ...(input.idempotencyKey !== undefined && {
            targetIdempotencyKey: input.idempotencyKey,
          }),
          ...(input.lastAttemptAt !== undefined && {
            lastAttemptAt: this.toDate(input.lastAttemptAt),
          }),
          ...(input.order !== undefined && { order: input.order }),
          ...(input.publishedAt !== undefined && {
            publishedAt: this.toDate(input.publishedAt),
          }),
          ...(input.readiness !== undefined && {
            targetReadiness: input.readiness
              ? this.toJson(input.readiness)
              : Prisma.JsonNull,
          }),
          ...(input.retryCount !== undefined && {
            retryCount: input.retryCount,
          }),
          ...(input.scheduledDate !== undefined && {
            scheduledDate: this.toDate(input.scheduledDate),
          }),
          ...(input.settings !== undefined && {
            targetSettings: this.toJson(input.settings),
          }),
          ...(input.timezone !== undefined && { timezone: input.timezone }),
          ...(input.url !== undefined && { url: input.url }),
          ...(input.validationIssues !== undefined && {
            targetValidationIssues: input.validationIssues,
          }),
          ...(input.validationState !== undefined && {
            targetValidationState: input.validationState,
          }),
          ...(validation && {
            targetValidationIssues: this.validationIssues(validation),
            targetValidationState: validation.validationState,
          }),
        },
        where: { id: existing.id },
      });

      return this.recalculateAndHydrate(tx, organizationId, group.id, userId);
    });
    if (
      input.scheduledDate !== undefined ||
      input.settings !== undefined ||
      input.timezone !== undefined
    ) {
      await this.publishApprovalsService.invalidatePost(
        organizationId,
        targetId,
        'Channel destination settings or protected schedule intent changed.',
        userId,
      );
    }
    return release;
  }

  cancel(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.CANCELLED,
    );
  }

  pause(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.PAUSED,
      [TargetExecutionState.SCHEDULED],
    );
  }

  resume(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    return this.transitionGroupTargets(
      organizationId,
      userId,
      groupId,
      TargetExecutionState.SCHEDULED,
      [TargetExecutionState.PAUSED],
    );
  }

  async publishNow(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const release = await this.prisma.$transaction(async (tx) => {
      const group = await this.getGroupOrThrow(tx, organizationId, groupId);
      const targets = await this.getTargets(tx, organizationId, group.id);

      for (const target of targets) {
        const validation = validateChannelTargetSettings({
          caption: group.baseContent,
          credentialId: target.credentialId,
          media: this.toValidationMedia(this.asMedia(group.media)),
          platform: target.platform,
          publishMode: 'publish_now',
          settings: this.asRecord(target.targetSettings),
        });

        if (!validation.valid) {
          throw this.invalidTargetException(
            {
              credentialId: target.credentialId,
              platform: target.platform as CredentialPlatform,
            },
            validation,
          );
        }
      }

      await tx.post.updateMany({
        data: {
          scheduledDate: new Date(),
          status: TargetExecutionState.SCHEDULED,
          targetExecutionState: TargetExecutionState.SCHEDULED,
        },
        where: {
          groupId: group.id,
          isDeleted: false,
          organizationId,
          targetExecutionState: { in: Array.from(GROUP_ACTION_STATES) },
        },
      });

      return this.recalculateAndHydrate(tx, organizationId, group.id, userId);
    });

    await this.approveReleaseTargets(release, userId, 'immediate');
    await this.enqueueReleaseTargets(release, userId);
    return release;
  }

  private async enqueueReleaseTargets(
    release: IReleaseGroup,
    userId: string,
  ): Promise<void> {
    const targets = (release.targets ?? []).filter(
      (target) => target.executionState === TargetExecutionState.SCHEDULED,
    );
    if (targets.length === 0) {
      return;
    }

    const durableTargets = await this.prisma.post.findMany({
      select: {
        id: true,
        publishApproval: {
          select: {
            artifactVersionPinId: true,
            id: true,
            operationId: true,
          },
        },
      },
      where: {
        id: { in: targets.map((target) => target.id) },
        isDeleted: false,
        organizationId: release.organizationId,
      },
    });
    const approvals = new Map(
      durableTargets.map((target) => [target.id, target.publishApproval]),
    );

    await Promise.all(
      targets.map(async (target) => {
        const approval = approvals.get(target.id);
        if (!approval) {
          throw new ConflictException(
            `Target ${target.id} has no version-bound publish approval.`,
          );
        }
        await this.publishApprovalsService.markQueued(
          approval.id,
          release.organizationId,
          userId,
        );
        return this.postPublishQueueService.enqueue({
          approvalId: approval.id,
          operationId: approval.operationId,
          organizationId: release.organizationId,
          postId: target.id,
          source: 'publish_now',
          userId,
          versionPinId: approval.artifactVersionPinId,
        });
      }),
    );
  }

  private async approveReleaseTargets(
    release: IReleaseGroup,
    userId: string,
    mode: 'immediate' | 'scheduled',
  ): Promise<void> {
    try {
      await Promise.all(
        (release.targets ?? []).map((target) =>
          this.publishApprovalsService.createForCurrentPost({
            actorUserId: userId,
            mode,
            organizationId: release.organizationId,
            postId: target.id,
            provenance: {
              releaseId: release.id,
              surface: 'post-groups',
            },
          }),
        ),
      );
    } catch (error: unknown) {
      await this.prisma.$transaction([
        this.prisma.post.updateMany({
          data: {
            status: TargetExecutionState.PAUSED,
            targetExecutionState: TargetExecutionState.PAUSED,
          },
          where: {
            groupId: release.id,
            isDeleted: false,
            organizationId: release.organizationId,
          },
        }),
        this.prisma.postGroup.update({
          data: { status: ReleaseStatus.PAUSED },
          where: { id: release.id },
        }),
      ]);
      throw error;
    }
  }

  private async transitionGroupTargets(
    organizationId: string,
    userId: string,
    groupId: string,
    nextState: TargetExecutionState,
    fromStates: readonly TargetExecutionState[] = Array.from(
      GROUP_ACTION_STATES,
    ) as TargetExecutionState[],
  ): Promise<IReleaseGroup> {
    const release = await this.prisma.$transaction(async (tx) => {
      const group = await this.getGroupOrThrow(tx, organizationId, groupId);
      await tx.post.updateMany({
        data: {
          status: nextState,
          targetExecutionState: nextState,
        },
        where: {
          groupId: group.id,
          isDeleted: false,
          organizationId,
          targetExecutionState: { in: [...fromStates] },
        },
      });

      return this.recalculateAndHydrate(tx, organizationId, group.id, userId);
    });
    if (nextState === TargetExecutionState.CANCELLED) {
      await this.invalidateReleaseApprovals(
        release,
        userId,
        'The scheduled release was cancelled.',
      );
    }
    return release;
  }

  private async invalidateReleaseApprovals(
    release: IReleaseGroup,
    userId: string,
    reason: string,
  ): Promise<void> {
    await Promise.all(
      (release.targets ?? []).map((target) =>
        this.publishApprovalsService.invalidatePost(
          release.organizationId,
          target.id,
          reason,
          userId,
        ),
      ),
    );
  }

  private async recalculateAndHydrate(
    tx: Pick<SchedulerTx, 'post' | 'postGroup'>,
    organizationId: string,
    groupId: string,
    userId: string,
  ): Promise<IReleaseGroup> {
    const group = await this.getGroupOrThrow(tx, organizationId, groupId);
    const targets = await this.getTargets(tx, organizationId, group.id);
    const status = deriveReleaseStatusFromTargets(
      targets.map(
        (target) => target.targetExecutionState as TargetExecutionState,
      ),
    );
    const transitions =
      status !== group.status
        ? this.appendTransition(
            group.statusTransitions,
            group.status,
            status,
            userId,
          )
        : undefined;

    const updated = (await tx.postGroup.update({
      data: {
        status,
        ...(transitions !== undefined && { statusTransitions: transitions }),
      },
      where: { id: group.id },
    })) as SchedulerPostGroup;

    return this.toReleaseGroup(updated, targets);
  }

  private parseCreateInput(
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

  private parseUpdateInput(body: unknown): UpdateReleaseGroupInput {
    const parsed = updateReleaseGroupSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequestFromZod(parsed.error);
    }
    return parsed.data;
  }

  private parseTargetInput(body: unknown): UpdateChannelTargetInput {
    const parsed = updateChannelTargetSchema.safeParse(body);
    if (!parsed.success) {
      throw this.badRequestFromZod(parsed.error);
    }
    return parsed.data;
  }

  private badRequestFromZod(error: ZodError): BadRequestException {
    return new BadRequestException({
      detail: error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
      title: 'Invalid scheduler mutation payload',
    });
  }

  private resolveCreateStatus(input: CreateReleaseGroupInput): ReleaseStatus {
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

  private async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<IReleaseGroup | undefined> {
    const group = (await this.prisma.postGroup.findFirst({
      where: { idempotencyKey, isDeleted: false, organizationId },
    })) as SchedulerPostGroup | null;

    if (!group) {
      return undefined;
    }

    const targets = await this.getTargets(
      this.prisma,
      organizationId,
      group.id,
    );
    return this.toReleaseGroup(group, targets);
  }

  private async resolveCredentials(
    tx: Pick<SchedulerTx, 'credential'>,
    organizationId: string,
    targets: readonly ChannelTargetInput[],
  ): Promise<Map<string, SchedulerCredential>> {
    const ids = [...new Set(targets.map((target) => target.credentialId))];
    const credentials = (await tx.credential.findMany({
      select: {
        brandId: true,
        id: true,
        isConnected: true,
        organizationId: true,
        platform: true,
      },
      where: {
        id: { in: ids },
        isDeleted: false,
        organizationId,
      },
    })) as SchedulerCredential[];
    const byId = new Map(
      credentials.map((credential) => [credential.id, credential]),
    );

    for (const target of targets) {
      const credential = byId.get(target.credentialId);
      if (!credential) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not connected to this organization.`,
        );
      }
      if (
        String(credential.platform).toLowerCase() !==
        String(target.platform).toLowerCase()
      ) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is for ${credential.platform}, not ${target.platform}.`,
        );
      }
      if (!credential.isConnected) {
        throw new BadRequestException(
          `Credential ${target.credentialId} is not connected.`,
        );
      }
    }

    return byId;
  }

  private async resolveBrandId(
    tx: Pick<SchedulerTx, 'brand'>,
    organizationId: string,
    requestedBrandId: string | undefined,
    credentials: ReadonlyMap<string, SchedulerCredential>,
  ): Promise<string> {
    const brandId =
      requestedBrandId ??
      [...credentials.values()].find((credential) => credential.brandId)
        ?.brandId ??
      undefined;

    if (!brandId) {
      throw new BadRequestException(
        'brandId is required when scheduler credentials are not brand-scoped.',
      );
    }

    const brand = await tx.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new BadRequestException(
        `Brand ${brandId} is not available for this organization.`,
      );
    }

    for (const credential of credentials.values()) {
      if (credential.brandId && credential.brandId !== brandId) {
        throw new BadRequestException(
          `Credential ${credential.id} belongs to a different brand.`,
        );
      }
    }

    return brandId;
  }

  private validateTarget(
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

  private invalidTargetException(
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

  private async createAttachmentPosts(
    tx: Pick<SchedulerTx, 'post'>,
    params: {
      brandId: string;
      group: SchedulerPostGroup;
      input: CreateReleaseGroupInput;
      parent: SchedulerPostTarget;
      target: ChannelTargetInput;
      userId: string;
    },
  ): Promise<void> {
    const attachments = [
      ...(params.input.attachments ?? []).filter(
        (attachment) =>
          !attachment.platform ||
          attachment.platform === params.target.platform,
      ),
      ...(params.target.attachments ?? []),
    ].filter((attachment) => this.isChildPostAttachment(attachment));

    for (const [index, attachment] of attachments.entries()) {
      await tx.post.create({
        data: {
          brandId: params.brandId,
          credentialId: params.target.credentialId,
          description: attachment.body,
          groupId: params.group.id,
          label: `${params.group.title} ${attachment.kind}`,
          order: attachment.order ?? index,
          organizationId: params.group.organizationId,
          parentId: params.parent.id,
          platform: params.target.platform,
          scheduledDate: params.parent.scheduledDate,
          status: params.parent.targetExecutionState,
          targetExecutionState: params.parent.targetExecutionState,
          timezone: params.parent.timezone,
          userId: params.userId,
        },
      });
    }
  }

  private isChildPostAttachment(attachment: ReleaseAttachmentInput): boolean {
    return (
      attachment.kind === ReleaseAttachmentKind.COMMENT ||
      attachment.kind === ReleaseAttachmentKind.THREAD
    );
  }

  private async getGroupOrThrow(
    client: Pick<SchedulerTx, 'postGroup'>,
    organizationId: string,
    groupId: string,
  ): Promise<SchedulerPostGroup> {
    const group = (await client.postGroup.findFirst({
      where: { id: groupId, isDeleted: false, organizationId },
    })) as SchedulerPostGroup | null;

    if (!group) {
      throw new NotFoundException('PostGroup', groupId);
    }

    return group;
  }

  private async getTargetOrThrow(
    client: Pick<SchedulerTx, 'post'>,
    organizationId: string,
    groupId: string,
    targetId: string,
  ): Promise<SchedulerPostTarget> {
    const target = (await client.post.findFirst({
      where: {
        groupId,
        id: targetId,
        isDeleted: false,
        organizationId,
      },
    })) as SchedulerPostTarget | null;

    if (!target) {
      throw new NotFoundException('ChannelTarget', targetId);
    }

    return target;
  }

  private async getTargets(
    client: Pick<SchedulerTx, 'post'>,
    organizationId: string,
    groupId: string,
  ): Promise<SchedulerPostTarget[]> {
    return (await client.post.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      where: {
        groupId,
        isDeleted: false,
        organizationId,
        parentId: null,
      },
    })) as SchedulerPostTarget[];
  }

  private toReleaseGroup(
    group: SchedulerPostGroup,
    targets: readonly SchedulerPostTarget[],
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
      targets: targets.map((target) => this.toChannelTarget(target, group.id)),
      timezone: group.timezone,
      title: group.title,
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  private toChannelTarget(
    target: SchedulerPostTarget,
    groupId: string,
  ): IChannelTarget {
    return {
      attachments: this.asReleaseAttachments(
        target.targetAttachments,
        groupId,
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
      releaseId: groupId,
      retryCount: target.retryCount,
      scheduledAt: this.toIso(target.scheduledDate),
      settings: this.asRecord(target.targetSettings),
      timezone: target.timezone,
      updatedAt: target.updatedAt.toISOString(),
      url: target.url,
      validationIssues: target.targetValidationIssues,
      validationState: target.targetValidationState as TargetValidationState,
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

  private appendTransition(
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

  private buildTransition(
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

  private validationIssues(
    validation: ChannelTargetValidationResult,
  ): string[] {
    return [...validation.errors, ...validation.warnings].map(
      (issue) => issue.message,
    );
  }

  private toTargetState(status: string): TargetExecutionState {
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

  private toPostStatus(status: string): string {
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

  private toDate(value: string | undefined | null): Date | null {
    return value ? new Date(value) : null;
  }

  private toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private toValidationMedia(
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

  private buildIngredientConnect(
    media: readonly ReleaseMediaReferenceInput[] | undefined,
  ): { connect: Array<{ id: string }> } | undefined {
    if (!media?.length) {
      return undefined;
    }
    return {
      connect: media.map((item) => ({ id: item.assetId })),
    };
  }

  private asMedia(value: Prisma.JsonValue): IReleaseMediaReference[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => this.isReleaseMediaReference(item))
      .map((item) => item as unknown as IReleaseMediaReference);
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
      .filter(this.isReleaseAttachmentInput)
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

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
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
