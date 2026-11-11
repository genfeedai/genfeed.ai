import { MENTION_CREATED_EVENT } from '@api/collections/mentions/constants/mention-events.constants';
import type { MentionCreatedEvent } from '@api/collections/mentions/interfaces/mention.interface';
import { CollaborationAlertsService } from '@api/services/collaboration-alerts/collaboration-alerts.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/** A validated mention puts one bell item, and an email, in front of the member. */
@Traced()
@Injectable()
export class MentionAlertListener {
  constructor(private readonly alerts: CollaborationAlertsService) {}

  @OnEvent(MENTION_CREATED_EVENT)
  async handleMentionCreated(event: MentionCreatedEvent): Promise<void> {
    await this.alerts.notifyMention({
      actorUserId: event.actorUserId,
      brandId: event.brandId,
      label: event.label,
      organizationId: event.organizationId,
      recipientUserId: event.mentionedUserId,
      source: event.source,
      taskId: event.taskId,
      threadId: event.threadId,
    });
  }
}
