import {
  type CollaborationNotificationPayload,
  readNotificationSourcePath,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { buildSystemEmailHtml } from '@helpers/email/system-email.helper';
import { buildCollaborationEmailBody } from '@helpers/email/system-email-templates.helper';

const COLLABORATION_EMAIL_HEADLINES: Record<
  CollaborationNotificationPayload['event'],
  { text: string; tone: 'neutral' | 'success' | 'warning' }
> = {
  handoff_received: { text: 'A teammate handed you a task', tone: 'warning' },
  mentioned: { text: 'You were mentioned', tone: 'neutral' },
  review_approved: { text: 'Review approved', tone: 'success' },
  review_changes_requested: { text: 'Changes requested', tone: 'warning' },
  review_requested: { text: 'Review requested', tone: 'warning' },
};

export function readCollaborationPayload(
  value: unknown,
): CollaborationNotificationPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (
    payload.kind !== 'collaboration' ||
    payload.version !== 1 ||
    typeof payload.label !== 'string' ||
    typeof payload.summary !== 'string' ||
    typeof payload.event !== 'string' ||
    !Object.hasOwn(COLLABORATION_EMAIL_HEADLINES, payload.event)
  ) {
    return null;
  }
  const sourcePath = readNotificationSourcePath(payload.sourcePath);
  return {
    event: payload.event as CollaborationNotificationPayload['event'],
    kind: 'collaboration',
    label: payload.label.slice(0, 300),
    summary: payload.summary.slice(0, 1000),
    version: 1,
    ...(sourcePath ? { sourcePath } : {}),
  };
}

/** The email for a review request, a review decision or a mention (#9947). */
export function buildCollaborationEmail(
  payload: CollaborationNotificationPayload,
  href: string | null,
): { html: string; subject: string; text: string } {
  const headline = COLLABORATION_EMAIL_HEADLINES[payload.event];
  const subject = `${headline.text}: ${payload.label}`;
  return {
    html: buildSystemEmailHtml({
      action: href ? { label: 'Open in Genfeed', url: href } : undefined,
      bodyHtml: buildCollaborationEmailBody({
        headline: headline.text,
        label: payload.label,
        summary: payload.summary,
        tone: headline.tone,
      }),
      title: subject,
    }),
    subject,
    text: [subject, payload.summary, href].filter(Boolean).join('\n'),
  };
}
