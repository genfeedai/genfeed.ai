import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  COLLABORATION_SOURCE_TYPE,
  type CollaborationNotificationPayload,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createLibraryAssetRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** A burst of mentions or decisions on one subject is one alert per window. */
const ALERT_WINDOW_MS = 15 * 60 * 1000;
const LABEL_LIMIT = 300;

type CollaborationEvent = CollaborationNotificationPayload['event'];

const ACTIVITY_KEY_BY_EVENT: Record<CollaborationEvent, ActivityKey> = {
  handoff_received: ActivityKey.AGENT_HANDOFF_RECEIVED,
  mentioned: ActivityKey.MENTIONED,
  review_approved: ActivityKey.ASSET_REVIEW_APPROVED,
  review_changes_requested: ActivityKey.ASSET_REVIEW_CHANGES_REQUESTED,
  review_requested: ActivityKey.ASSET_REVIEW_REQUESTED,
};

interface AlertBase {
  organizationId: string;
  brandId?: string | null;
  /** The member who did it. */
  actorUserId: string;
  /** The member who is told. */
  recipientUserId: string;
  /** What the alert is about, for display: an asset title or a thread name. */
  label: string;
}

export interface ReviewRequestedAlert extends AlertBase {
  ingredientId: string;
  /** The review task. One alert per task, so a new request alerts again. */
  taskId: string;
}

export interface ReviewDecidedAlert extends ReviewRequestedAlert {
  decision: 'approved' | 'changes_requested';
  reason?: string;
}

export interface MentionAlert extends AlertBase {
  source: { id: string; type: 'agent_thread' | 'task_comment' };
  threadId?: string;
  taskId?: string;
}

export interface HandoffReceivedAlert extends AlertBase {
  /** The hand-off. One alert per hand-off, however often it is replayed. */
  transferId: string;
  /** The teammate's conversation the hand-off waits in. */
  threadId: string;
}

interface RaiseInput extends AlertBase {
  event: CollaborationEvent;
  /** What a repeat of this event is deduplicated against. */
  subject: { id: string; type: string };
  isWindowed: boolean;
  summary: (actorName: string) => string;
  ingredientId?: string;
  threadId?: string;
  taskId?: string;
}

/**
 * Tells a member when a teammate asks them to review an asset, decides a review
 * they asked for, or mentions them (#9947). Each alert is one activity for the
 * member it is for, so the alert policy puts it in their bell and, when they
 * keep "Reviews and mentions" email on, in their inbox.
 *
 * Callers must already have proved the recipient may see the subject: this
 * service decides who is told and how often, not who is allowed to see what.
 * An alert never fails the action that raised it.
 */
@Traced()
@Injectable()
export class CollaborationAlertsService {
  private readonly context = { service: CollaborationAlertsService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly logger: LoggerService,
  ) {}

  /** Asks the reviewer to review the asset. */
  async notifyReviewRequested(input: ReviewRequestedAlert): Promise<void> {
    await this.raise({
      ...input,
      event: 'review_requested',
      ingredientId: input.ingredientId,
      isWindowed: false,
      subject: { id: input.taskId, type: 'task' },
      summary: (actorName) =>
        `${actorName} asked you to review ${quote(input.label)}.`,
      taskId: input.taskId,
    });
  }

  /** Tells the requester what the reviewer decided. */
  async notifyReviewDecided(input: ReviewDecidedAlert): Promise<void> {
    const isApproved = input.decision === 'approved';
    const reason = input.reason?.trim();
    await this.raise({
      ...input,
      event: isApproved ? 'review_approved' : 'review_changes_requested',
      ingredientId: input.ingredientId,
      isWindowed: true,
      subject: { id: input.taskId, type: 'task' },
      summary: (actorName) =>
        `${actorName} ${isApproved ? 'approved' : 'asked for changes on'} ${quote(input.label)}.${
          !isApproved && reason ? ` ${reason}` : ''
        }`,
      taskId: input.taskId,
    });
  }

  /** Tells a teammate a task was handed to their agent to accept or decline. */
  async notifyHandoffReceived(input: HandoffReceivedAlert): Promise<void> {
    await this.raise({
      ...input,
      event: 'handoff_received',
      isWindowed: false,
      subject: { id: input.transferId, type: 'transfer' },
      summary: (actorName) =>
        `${actorName} handed you a task in ${quote(input.label)}.`,
    });
  }

  /** Tells a tagged member they were mentioned. */
  async notifyMention(input: MentionAlert): Promise<void> {
    await this.raise({
      ...input,
      event: 'mentioned',
      isWindowed: true,
      // A burst in one thread or task is one alert, whoever wrote each comment.
      subject: input.threadId
        ? { id: input.threadId, type: 'thread' }
        : input.taskId
          ? { id: input.taskId, type: 'task' }
          : input.source,
      summary: (actorName) =>
        `${actorName} mentioned you in ${quote(input.label)}.`,
    });
  }

  private async raise(input: RaiseInput): Promise<void> {
    if (!input.recipientUserId || input.recipientUserId === input.actorUserId) {
      return;
    }
    try {
      const key = ACTIVITY_KEY_BY_EVENT[input.event];
      const label = input.label.trim().slice(0, LABEL_LIMIT) || 'Untitled';
      const [actorName, links] = await Promise.all([
        this.resolveActorName(input.actorUserId),
        this.resolveLinks(input),
      ]);
      const summary = input.summary(actorName).slice(0, 1000);
      const payload: CollaborationNotificationPayload = {
        event: input.event,
        kind: 'collaboration',
        label,
        summary,
        version: 1,
        ...links.payload,
      };
      const window = input.isWindowed
        ? `/${Math.floor(Date.now() / ALERT_WINDOW_MS)}`
        : '';
      await this.activityRecorder.record({
        alert: {
          actorUserId: input.actorUserId,
          deduplicationKey: `${key}/${input.subject.type}:${input.subject.id}/${input.recipientUserId}${window}`,
          payload: { ...payload },
          source: { id: input.subject.id, type: COLLABORATION_SOURCE_TYPE },
        },
        brandId: links.brandId,
        entityId: links.entity.id,
        entityModel: links.entity.model,
        key,
        organizationId: input.organizationId,
        source: ActivitySource.COLLABORATION,
        userId: input.recipientUserId,
        value: summary,
      });
    } catch (error: unknown) {
      this.logger.error(
        'Collaboration alert could not be recorded',
        error,
        this.context,
      );
    }
  }

  private async resolveActorName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      select: { firstName: true, handle: true, lastName: true, name: true },
      where: { id: userId },
    });
    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || user?.name?.trim() || user?.handle || 'A teammate';
  }

  /**
   * The ids the bell links from, the path the email links to, and the entity
   * the activity is recorded against.
   */
  private async resolveLinks(input: RaiseInput): Promise<{
    brandId: string | null;
    entity: { id: string | null; model: string | null };
    payload: Partial<CollaborationNotificationPayload>;
  }> {
    const { organizationId } = input;
    const ingredient = input.ingredientId
      ? await this.prisma.ingredient.findFirst({
          select: { brandId: true, category: true, id: true },
          where: scopedWhere(organizationId, { id: input.ingredientId }),
        })
      : null;
    const task = input.taskId
      ? await this.prisma.task.findFirst({
          select: { identifier: true },
          where: scopedWhere(organizationId, { id: input.taskId }),
        })
      : null;
    const brandId = ingredient?.brandId ?? input.brandId ?? null;
    const [organization, brand] = await Promise.all([
      this.prisma.organization.findFirst({
        select: { slug: true },
        where: { id: organizationId, isDeleted: false },
      }),
      brandId
        ? this.prisma.brand.findFirst({
            select: { slug: true },
            where: scopedWhere(organizationId, { id: brandId }),
          })
        : null,
    ]);

    const path = ingredient
      ? createLibraryAssetRoute(ingredient.category, ingredient.id)
      : input.threadId
        ? `${APP_ROUTES.AGENT.ROOT}/${encodeURIComponent(input.threadId)}`
        : task?.identifier
          ? `${APP_ROUTES.WORKSPACE.TASKS}/${encodeURIComponent(task.identifier)}`
          : null;
    const sourcePath =
      organization?.slug && path
        ? brand?.slug
          ? createBrandAppRoute(organization.slug, brand.slug, path)
          : createOrganizationAppRoute(organization.slug, path)
        : undefined;

    return {
      brandId,
      entity: ingredient
        ? { id: ingredient.id, model: 'Ingredient' }
        : input.threadId
          ? { id: input.threadId, model: 'AgentThread' }
          : { id: input.taskId ?? null, model: input.taskId ? 'Task' : null },
      payload: {
        ...(brandId ? { brandId } : {}),
        ...(ingredient
          ? {
              ingredientCategory: String(ingredient.category),
              ingredientId: ingredient.id,
            }
          : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(task?.identifier ? { taskIdentifier: task.identifier } : {}),
        ...(sourcePath ? { sourcePath } : {}),
      },
    };
  }
}

function quote(label: string): string {
  return `“${label.trim().slice(0, LABEL_LIMIT) || 'Untitled'}”`;
}
