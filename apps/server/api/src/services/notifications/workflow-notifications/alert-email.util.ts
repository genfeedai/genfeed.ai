import type {
  AlertEmailEvent,
  AlertEmailNotificationPayload,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { buildSystemEmailHtml } from '@helpers/email/system-email.helper';
import { buildAlertEmailBody } from '@helpers/email/system-email-templates.helper';

const ALERT_EMAIL_HEADLINES: Record<
  AlertEmailEvent,
  { area: string; text: string; tone: 'danger' | 'warning' }
> = {
  channel_disconnected: {
    area: 'Channels',
    text: 'Channel disconnected',
    tone: 'warning',
  },
  manual_post_needed: {
    area: 'Publishing',
    text: 'Post this by hand',
    tone: 'warning',
  },
  post_failed: { area: 'Publishing', text: 'Post failed', tone: 'danger' },
  publish_unverified: {
    area: 'Publishing',
    text: 'Check this post before reposting',
    tone: 'warning',
  },
};

export function readAlertEmailPayload(
  value: unknown,
): AlertEmailNotificationPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (
    payload.kind !== 'alert_email' ||
    payload.version !== 1 ||
    typeof payload.label !== 'string' ||
    typeof payload.summary !== 'string' ||
    typeof payload.event !== 'string' ||
    !Object.hasOwn(ALERT_EMAIL_HEADLINES, payload.event)
  ) {
    return null;
  }
  return {
    event: payload.event as AlertEmailEvent,
    kind: 'alert_email',
    label: payload.label.slice(0, 300),
    summary: payload.summary.slice(0, 1000),
    version: 1,
  };
}

/** The email for a failed post, an unconfirmed one, a post to make by hand or a lost channel. */
export function buildAlertEmail(payload: AlertEmailNotificationPayload): {
  html: string;
  subject: string;
  text: string;
} {
  const headline = ALERT_EMAIL_HEADLINES[payload.event];
  const subject = `${headline.text}: ${payload.label}`;
  return {
    html: buildSystemEmailHtml({
      bodyHtml: buildAlertEmailBody({
        area: headline.area,
        headline: headline.text,
        label: payload.label,
        summary: payload.summary,
        tone: headline.tone,
      }),
      title: subject,
    }),
    subject,
    text: [subject, payload.summary].join('\n'),
  };
}
