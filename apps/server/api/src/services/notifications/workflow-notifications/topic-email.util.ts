import {
  buildAlertEmail,
  readAlertEmailPayload,
} from '@api/services/notifications/workflow-notifications/alert-email.util';
import {
  buildCollaborationEmail,
  readCollaborationPayload,
} from '@api/services/notifications/workflow-notifications/collaboration-email.util';
import {
  COLLABORATION_NOTIFICATION_TOPIC,
  COLLABORATION_SOURCE_TYPE,
  EMAIL_NOTIFICATION_CHANNEL,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { defaultProductEmailPreference } from '@genfeedai/contracts/interfaces';

export interface TopicEmail {
  build: (href: string | null) => {
    html: string;
    subject: string;
    text: string;
  };
  isEnabledByDefault: boolean;
  sourcePath?: string;
}

/** The email a topic renders, or null when the event does not carry one. */
export function readTopicEmail(recipient: {
  channel: string;
  event: { payload: unknown; sourceType: string };
  topic: string;
}): TopicEmail | null {
  if (recipient.channel !== EMAIL_NOTIFICATION_CHANNEL) return null;
  if (recipient.topic === COLLABORATION_NOTIFICATION_TOPIC) {
    const payload = readCollaborationPayload(recipient.event.payload);
    return payload && recipient.event.sourceType === COLLABORATION_SOURCE_TYPE
      ? {
          build: (href) => buildCollaborationEmail(payload, href),
          isEnabledByDefault: defaultProductEmailPreference(
            COLLABORATION_NOTIFICATION_TOPIC,
          ),
          sourcePath: payload.sourcePath,
        }
      : null;
  }
  const payload = readAlertEmailPayload(recipient.event.payload);
  return payload
    ? { build: () => buildAlertEmail(payload), isEnabledByDefault: true }
    : null;
}
