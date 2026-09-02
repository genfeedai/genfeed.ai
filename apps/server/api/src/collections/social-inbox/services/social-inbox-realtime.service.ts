import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { SocialInboxRealtimeEvent } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class SocialInboxRealtimeService {
  constructor(
    @Optional()
    private readonly notificationsPublisher?: NotificationsPublisherService,
  ) {}

  async emit(
    organizationId: string,
    conversationId: string,
    kind: SocialInboxRealtimeEvent['kind'],
  ): Promise<void> {
    if (!this.notificationsPublisher) {
      return;
    }

    const payload: SocialInboxRealtimeEvent & { room: string } = {
      conversationId,
      kind,
      room: `org-${organizationId}`,
    };
    await Promise.allSettled([
      this.notificationsPublisher.emit(
        WebSocketPaths.socialInbox(organizationId),
        payload,
      ),
      this.notificationsPublisher.emit(
        WebSocketPaths.socialConversation(conversationId),
        payload,
      ),
    ]);
  }
}
