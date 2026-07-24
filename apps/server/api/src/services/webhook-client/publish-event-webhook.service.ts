import { createHash } from 'node:crypto';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { assertSafeWebhookEndpoint } from '@api/services/webhook-client/webhook-endpoint.validator';
import {
  classifyPublishWebhookError,
  createPublishWebhookEventId,
  createSamplePublishWebhookPayload,
  PUBLISH_WEBHOOK_EVENT_TYPES,
  PUBLISH_WEBHOOK_SCHEMA_VERSION,
  type PublishWebhookEventType,
  type PublishWebhookPayload,
  type PublishWebhookRelease,
  type PublishWebhookTarget,
  publishWebhookPayloadSchema,
  redactPublishWebhookText,
} from '@api-types/contracts/publish-webhook-events.contract';
import { ReleaseStatus, TargetExecutionState } from '@genfeedai/enums';
import type { IWebhookDeliveryStatus } from '@genfeedai/interfaces';
import {
  WEBHOOK_CLIENT_QUEUE,
  type WebhookJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

type PublishWebhookPostSnapshot = {
  _id?: unknown;
  brand?: unknown;
  credential?: unknown;
  credentialId?: unknown;
  externalId?: unknown;
  externalShortcode?: unknown;
  groupId?: unknown;
  id?: unknown;
  isDeleted?: unknown;
  organization?: unknown;
  organizationId?: unknown;
  platform?: unknown;
  publicationDate?: unknown;
  publishedAt?: unknown;
  scheduledDate?: unknown;
  status?: unknown;
  url?: unknown;
  user?: unknown;
};

type PublishOutcomeInput = {
  errorCode?: string | null;
  errorMessage?: string | null;
  externalProviderId?: string | null;
  externalShortcode?: string | null;
  occurredAt?: Date;
  platform?: string | null;
  post: PublishWebhookPostSnapshot;
  publishedAt?: Date | string | null;
  retryable?: boolean;
  url?: string | null;
};

type TerminalTargetResolution =
  | {
      reason: 'terminal';
      targets: PublishWebhookTarget[];
    }
  | {
      reason: 'non-terminal';
    };

const PUBLISH_WEBHOOK_DEDUPE_RETENTION_SECONDS = 24 * 60 * 60;
const PUBLISH_WEBHOOK_FAILED_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const PUBLISH_WEBHOOK_JOB_ID_PREFIX = 'publish-webhook-';

@Injectable()
export class PublishEventWebhookService {
  private readonly constructorName = 'PublishEventWebhookService';

  constructor(
    @InjectQueue(WEBHOOK_CLIENT_QUEUE)
    private readonly webhookQueue: Queue<WebhookJobData>,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly postsService: PostsService,
  ) {}

  async emitLegacyPostPublished(input: PublishOutcomeInput): Promise<void> {
    await this.emitLegacyPostOutcome(input, TargetExecutionState.PUBLISHED);
  }

  async emitLegacyPostFailed(input: PublishOutcomeInput): Promise<void> {
    await this.emitLegacyPostOutcome(input, TargetExecutionState.FAILED);
  }

  async sendTestDelivery(input: {
    event?: PublishWebhookEventType;
    organizationId: string;
  }): Promise<IWebhookDeliveryStatus> {
    const settings = await this.organizationSettingsService.findOne({
      organization: input.organizationId,
    });

    if (
      !settings?.isWebhookEnabled ||
      !settings.webhookEndpoint ||
      !settings.webhookSecret
    ) {
      throw new BadRequestException('Webhook endpoint is not configured');
    }

    const event =
      input.event ??
      readWebhookEventTypes(settings.webhookEventTypes)[0] ??
      'target.published';
    const payload = createSamplePublishWebhookPayload({
      event,
      occurredAt: new Date(),
      releaseId: 'release_test',
      targetId: 'target_test',
    });

    try {
      const status = await this.queuePublishWebhook(
        input.organizationId,
        payload,
        {
          deliveryId: [
            'publish-test',
            input.organizationId,
            payload.event,
            Date.now().toString(36),
          ].join(':'),
          ignoreEventFilter: true,
          isTest: true,
        },
      );

      if (!status) {
        throw new BadRequestException('Webhook endpoint is not configured');
      }

      return status;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        redactPublishWebhookText(
          (error as Error)?.message || 'Webhook test delivery failed',
        ),
      );
    }
  }

  private async emitLegacyPostOutcome(
    input: PublishOutcomeInput,
    status: TargetExecutionState.PUBLISHED | TargetExecutionState.FAILED,
  ): Promise<void> {
    try {
      const organizationId = readReferenceId(
        input.post.organizationId ?? input.post.organization,
      );
      const targetId = readReferenceId(input.post.id ?? input.post._id);

      if (!organizationId || !targetId) {
        this.logger.warn(`${this.constructorName} skipped publish webhook`, {
          hasOrganizationId: Boolean(organizationId),
          hasTargetId: Boolean(targetId),
        });
        return;
      }

      const occurredAt = input.occurredAt ?? new Date();
      const occurredAtIso = occurredAt.toISOString();
      const releaseId = readReleaseId(input.post, targetId);
      const target = this.buildTarget(input, targetId, status, occurredAtIso);
      const targetEvent =
        status === TargetExecutionState.PUBLISHED
          ? 'target.published'
          : 'target.failed';
      const targetReleaseStatus =
        status === TargetExecutionState.PUBLISHED
          ? ReleaseStatus.PUBLISHED
          : ReleaseStatus.FAILED;

      const targetPayload = publishWebhookPayloadSchema.parse({
        event: targetEvent,
        eventId: createPublishWebhookEventId({
          event: targetEvent,
          releaseId,
          status,
          targetId,
        }),
        occurredAt: occurredAtIso,
        release: this.buildRelease(
          releaseId,
          targetReleaseStatus,
          [target],
          input.post,
        ),
        schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
        target,
        timestamp: occurredAtIso,
      });

      await this.queuePublishWebhook(organizationId, targetPayload);
      await this.emitReleaseOutcomeIfTerminal({
        currentTarget: target,
        occurredAtIso,
        organizationId,
        post: input.post,
        releaseId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to emit publish event`,
        {
          error: redactPublishWebhookText(
            (error as Error)?.message || 'Publish webhook emission failed',
          ),
          postId: readReferenceId(input.post.id ?? input.post._id),
        },
      );
    }
  }

  private async emitReleaseOutcomeIfTerminal(input: {
    currentTarget: PublishWebhookTarget;
    occurredAtIso: string;
    organizationId: string;
    post: PublishWebhookPostSnapshot;
    releaseId: string;
  }): Promise<void> {
    const targetResolution = await this.resolveTerminalReleaseTargets(
      input.post,
      input.currentTarget,
    );

    if (targetResolution.reason !== 'terminal') {
      return;
    }

    const releaseStatus = deriveReleaseStatus(targetResolution.targets);
    if (!releaseStatus) {
      return;
    }

    const releaseEvent =
      releaseStatus === ReleaseStatus.PUBLISHED
        ? 'release.published'
        : releaseStatus === ReleaseStatus.PARTIALLY_PUBLISHED
          ? 'release.partially_published'
          : 'release.failed';

    const releasePayload = publishWebhookPayloadSchema.parse({
      event: releaseEvent,
      eventId: createPublishWebhookEventId({
        event: releaseEvent,
        releaseId: input.releaseId,
        status: releaseStatus,
      }),
      occurredAt: input.occurredAtIso,
      release: this.buildRelease(
        input.releaseId,
        releaseStatus,
        targetResolution.targets,
        input.post,
      ),
      schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
      targets: targetResolution.targets,
      timestamp: input.occurredAtIso,
    });

    await this.queuePublishWebhook(input.organizationId, releasePayload);
  }

  private async resolveTerminalReleaseTargets(
    post: PublishWebhookPostSnapshot,
    currentTarget: PublishWebhookTarget,
  ): Promise<TerminalTargetResolution> {
    const groupId = readString(post.groupId);
    if (!groupId) {
      return { reason: 'terminal', targets: [currentTarget] };
    }

    try {
      const result = (await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            groupId,
            isDeleted: false,
            parent: null,
          },
        },
        {
          customLabels,
          limit: 100,
          page: 1,
        },
      )) as unknown as { docs?: PublishWebhookPostSnapshot[] };

      const targets = new Map<string, PublishWebhookTarget>();
      for (const groupPost of result.docs ?? []) {
        const targetId = readReferenceId(groupPost.id ?? groupPost._id);
        if (!targetId) {
          return { reason: 'non-terminal' };
        }

        if (targetId === currentTarget.id) {
          targets.set(targetId, currentTarget);
          continue;
        }

        const terminalState = mapPostStatusToTerminalTargetState(
          readString(groupPost.status),
        );
        if (!terminalState) {
          return { reason: 'non-terminal' };
        }

        targets.set(
          targetId,
          this.buildTarget(
            { post: groupPost },
            targetId,
            terminalState,
            toIsoString(groupPost.publicationDate ?? groupPost.publishedAt) ??
              new Date().toISOString(),
          ),
        );
      }

      if (!targets.has(currentTarget.id)) {
        targets.set(currentTarget.id, currentTarget);
      }

      return { reason: 'terminal', targets: [...targets.values()] };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to resolve release target group`,
        {
          error: redactPublishWebhookText(
            (error as Error)?.message ||
              'Publish webhook target resolution failed',
          ),
          groupId,
          targetId: currentTarget.id,
        },
      );
      return { reason: 'terminal', targets: [currentTarget] };
    }
  }

  private buildTarget(
    input: PublishOutcomeInput,
    targetId: string,
    status: TargetExecutionState.PUBLISHED | TargetExecutionState.FAILED,
    occurredAtIso: string,
  ): PublishWebhookTarget {
    const errorMessage =
      status === TargetExecutionState.FAILED
        ? redactPublishWebhookText(input.errorMessage || 'Publish failed')
        : null;
    const errorClass = errorMessage
      ? classifyPublishWebhookError(errorMessage)
      : null;

    return {
      credential: {
        id:
          readReferenceId(input.post.credentialId ?? input.post.credential) ??
          'unknown',
      },
      error:
        errorMessage && errorClass
          ? {
              class: errorClass,
              code: input.errorCode
                ? redactPublishWebhookText(input.errorCode)
                : errorClass,
              message: errorMessage,
              retryable: input.retryable ?? false,
            }
          : null,
      externalProviderId:
        input.externalProviderId ?? readString(input.post.externalId),
      externalShortcode:
        input.externalShortcode ?? readString(input.post.externalShortcode),
      id: targetId,
      platform: input.platform ?? readString(input.post.platform) ?? 'unknown',
      publishedAt:
        status === TargetExecutionState.PUBLISHED
          ? (toIsoString(
              input.publishedAt ??
                input.post.publicationDate ??
                input.post.publishedAt,
            ) ?? occurredAtIso)
          : null,
      scheduledAt: toIsoString(input.post.scheduledDate),
      status,
      url: input.url ?? readString(input.post.url),
    };
  }

  private buildRelease(
    releaseId: string,
    releaseStatus:
      | ReleaseStatus.PUBLISHED
      | ReleaseStatus.PARTIALLY_PUBLISHED
      | ReleaseStatus.FAILED,
    targets: PublishWebhookTarget[],
    post: PublishWebhookPostSnapshot,
  ): PublishWebhookRelease {
    const publishedTargets = targets.filter(
      (target) => target.status === TargetExecutionState.PUBLISHED,
    );

    return {
      id: releaseId,
      publishedAt:
        releaseStatus === ReleaseStatus.PUBLISHED
          ? (publishedTargets[0]?.publishedAt ?? null)
          : null,
      scheduledAt: toIsoString(post.scheduledDate),
      status: releaseStatus,
      targetSummary: {
        failed: targets.filter(
          (target) => target.status === TargetExecutionState.FAILED,
        ).length,
        published: publishedTargets.length,
        total: targets.length,
      },
    };
  }

  private async queuePublishWebhook(
    organizationId: string,
    payload: PublishWebhookPayload,
    options: {
      deliveryId?: string;
      ignoreEventFilter?: boolean;
      isTest?: boolean;
    } = {},
  ): Promise<IWebhookDeliveryStatus | null> {
    const settings = await this.organizationSettingsService.findOne({
      organization: organizationId,
    });

    if (
      !settings?.isWebhookEnabled ||
      !settings.webhookEndpoint ||
      !settings.webhookSecret
    ) {
      return null;
    }

    if (
      !options.ignoreEventFilter &&
      !isPublishWebhookEventEnabled(settings.webhookEventTypes, payload.event)
    ) {
      this.logger.log(`${this.constructorName} publish webhook filtered`, {
        event: payload.event,
        eventId: payload.eventId,
        organizationId,
      });
      return null;
    }

    await assertSafeWebhookEndpoint(settings.webhookEndpoint);

    const deliveryId = options.deliveryId ?? payload.eventId;
    const jobData: WebhookJobData = {
      deliveryId,
      endpoint: settings.webhookEndpoint,
      isTest: options.isTest,
      organizationId,
      payload: payload as WebhookJobData['payload'],
      secret: settings.webhookSecret,
    };

    await this.webhookQueue.add(
      'send-webhook',
      jobData,
      options.isTest
        ? { jobId: createPublishWebhookJobId(deliveryId) }
        : {
            // Retried publish workers must resolve to the same BullMQ jobId long
            // enough to suppress duplicate terminal events.
            jobId: createPublishWebhookJobId(payload.eventId),
            removeOnComplete: {
              age: PUBLISH_WEBHOOK_DEDUPE_RETENTION_SECONDS,
              count: 10_000,
            },
            removeOnFail: {
              age: PUBLISH_WEBHOOK_FAILED_RETENTION_SECONDS,
              count: 10_000,
            },
          },
    );

    const status: IWebhookDeliveryStatus = {
      attempt: 0,
      deliveryId,
      event: payload.event,
      isTest: Boolean(options.isTest),
      queuedAt: new Date().toISOString(),
      status: 'queued',
    };
    await this.organizationSettingsService.recordWebhookDeliveryStatus(
      organizationId,
      status,
    );

    this.logger.log(`${this.constructorName} publish webhook queued`, {
      event: payload.event,
      deliveryId,
      eventId: payload.eventId,
      organizationId,
    });

    return status;
  }
}

function createPublishWebhookJobId(eventId: string): string {
  return `${PUBLISH_WEBHOOK_JOB_ID_PREFIX}${createHash('sha256')
    .update(eventId)
    .digest('hex')}`;
}

function readWebhookEventTypes(value: unknown): PublishWebhookEventType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (event): event is PublishWebhookEventType =>
      typeof event === 'string' &&
      PUBLISH_WEBHOOK_EVENT_TYPES.includes(event as PublishWebhookEventType),
  );
}

function isPublishWebhookEventEnabled(
  configuredEvents: unknown,
  event: PublishWebhookEventType,
): boolean {
  const eventTypes = readWebhookEventTypes(configuredEvents);
  return eventTypes.length === 0 || eventTypes.includes(event);
}

function deriveReleaseStatus(
  targets: PublishWebhookTarget[],
):
  | ReleaseStatus.PUBLISHED
  | ReleaseStatus.PARTIALLY_PUBLISHED
  | ReleaseStatus.FAILED
  | null {
  const published = targets.filter(
    (target) => target.status === TargetExecutionState.PUBLISHED,
  ).length;
  const failed = targets.filter(
    (target) => target.status === TargetExecutionState.FAILED,
  ).length;

  if (targets.length === 0 || published + failed !== targets.length) {
    return null;
  }

  if (published === targets.length) {
    return ReleaseStatus.PUBLISHED;
  }

  if (published > 0) {
    return ReleaseStatus.PARTIALLY_PUBLISHED;
  }

  return ReleaseStatus.FAILED;
}

function mapPostStatusToTerminalTargetState(
  status: string | null,
): TargetExecutionState.PUBLISHED | TargetExecutionState.FAILED | null {
  switch (status) {
    case 'public':
    case 'private':
    case 'unlisted':
      return TargetExecutionState.PUBLISHED;
    case 'failed':
      return TargetExecutionState.FAILED;
    default:
      return null;
  }
}

function readReleaseId(
  post: PublishWebhookPostSnapshot,
  fallbackId: string,
): string {
  return readString(post.groupId) ?? fallbackId;
}

function readReferenceId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return (
    readString(record.id) ??
    readString(record._id) ??
    readString(record.mongoId)
  );
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}
