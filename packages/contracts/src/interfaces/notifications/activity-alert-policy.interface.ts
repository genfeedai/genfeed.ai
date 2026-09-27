import { ActivityKey } from '../../enums/activity.enum';
import {
  type NotificationTopic,
  SOCIAL_REPLY_NOTIFICATION_TOPIC,
} from './notification-preference.interface';

/**
 * A notification is an activity that needs someone's attention (#5197).
 *
 * Every user-facing event is recorded once, as an Activity. This map is the
 * only place that decides which activity keys also raise an alert, who
 * receives it and on which channels. A key that is absent here is history
 * only: it appears on the activities pages and never in the bell.
 */

/** Channels an alert can be delivered on. `in_app` is the topbar bell. */
export const ALERT_CHANNELS = [
  'in_app',
  'email',
  'discord',
  'telegram',
  'slack',
] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/**
 * - `actor`: the activity's user (the person the event happened for).
 * - `organization-owner`: the organization's owner.
 * - `operator`: the deployment operator's channel (for example the operator
 *   Discord server). Never a tenant user.
 * - `explicit`: destinations the producer names at record time (for example
 *   the review-gate email address or Slack channel a workflow configured).
 */
export type AlertRecipient =
  | 'actor'
  | 'organization-owner'
  | 'operator'
  | 'explicit';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface ActivityAlertRoute {
  recipient: AlertRecipient;
  /** Default channels for this recipient. A producer may only narrow them. */
  channels: readonly AlertChannel[];
}

export interface ActivityAlertPolicy {
  topic: NotificationTopic;
  severity: AlertSeverity;
  recipients: readonly ActivityAlertRoute[];
}

const GENERATION_FAILED: ActivityAlertPolicy = {
  recipients: [{ channels: ['in_app'], recipient: 'actor' }],
  severity: 'warning',
  topic: 'generation.status',
};

export const ACTIVITY_ALERT_POLICIES = {
  [ActivityKey.ARTICLE_FAILED]: GENERATION_FAILED,
  [ActivityKey.IMAGE_FAILED]: GENERATION_FAILED,
  [ActivityKey.IMAGE_REFRAME_FAILED]: GENERATION_FAILED,
  [ActivityKey.IMAGE_UPSCALE_FAILED]: GENERATION_FAILED,
  [ActivityKey.MODELS_TRAINING_FAILED]: GENERATION_FAILED,
  [ActivityKey.MUSIC_FAILED]: GENERATION_FAILED,
  [ActivityKey.VIDEO_FAILED]: GENERATION_FAILED,
  [ActivityKey.VIDEO_REFRAME_FAILED]: GENERATION_FAILED,
  [ActivityKey.VIDEO_UPSCALE_FAILED]: GENERATION_FAILED,
  [ActivityKey.VOICE_FAILED]: GENERATION_FAILED,
  [ActivityKey.POST_FAILED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'critical',
    topic: 'publishing.status',
  },
  [ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'warning',
    topic: 'integration.status',
  },
  [ActivityKey.SOCIAL_INTEGRATION_FAILED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'warning',
    topic: 'integration.status',
  },
  [ActivityKey.SOCIAL_HISTORY_IMPORT_FAILED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'warning',
    topic: 'integration.status',
  },
  [ActivityKey.SOCIAL_REPLIES_RECEIVED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'info',
    topic: SOCIAL_REPLY_NOTIFICATION_TOPIC,
  },
  [ActivityKey.WORKFLOW_EXECUTION_COMPLETED]: {
    recipients: [{ channels: ['in_app', 'email'], recipient: 'actor' }],
    severity: 'success',
    topic: 'workflow.status',
  },
  [ActivityKey.WORKFLOW_EXECUTION_FAILED]: {
    recipients: [{ channels: ['in_app', 'email'], recipient: 'actor' }],
    severity: 'critical',
    topic: 'workflow.status',
  },
  [ActivityKey.AGENT_RUN_COMPLETED]: {
    recipients: [
      {
        channels: ['in_app', 'email', 'telegram', 'discord'],
        recipient: 'actor',
      },
    ],
    severity: 'success',
    topic: 'agent.status',
  },
  [ActivityKey.AGENT_RUN_FAILED]: {
    recipients: [
      {
        channels: ['in_app', 'email', 'telegram', 'discord'],
        recipient: 'actor',
      },
    ],
    severity: 'critical',
    topic: 'agent.status',
  },
  [ActivityKey.AGENT_REVIEW_CHANGED]: {
    recipients: [{ channels: ['in_app', 'email'], recipient: 'actor' }],
    severity: 'info',
    topic: 'agent.status',
  },
  [ActivityKey.AGENT_REVIEW_EXPIRED]: {
    recipients: [{ channels: ['in_app', 'email'], recipient: 'actor' }],
    severity: 'warning',
    topic: 'agent.status',
  },
  [ActivityKey.CREDITS_LOW]: {
    recipients: [
      { channels: ['in_app'], recipient: 'organization-owner' },
      { channels: ['discord'], recipient: 'operator' },
    ],
    severity: 'warning',
    topic: 'billing.credits',
  },
  [ActivityKey.WORKFLOW_REVIEW_REQUESTED]: {
    recipients: [
      { channels: ['in_app'], recipient: 'actor' },
      { channels: ['email', 'slack'], recipient: 'explicit' },
    ],
    severity: 'warning',
    topic: 'approval.requests',
  },
  [ActivityKey.MCP_APPROVAL_REQUESTED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'warning',
    topic: 'approval.requests',
  },
  [ActivityKey.WORKFLOW_REPORT_DELIVERED]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'info',
    topic: 'workflow.status',
  },
  [ActivityKey.TREND_SUMMARY_READY]: {
    recipients: [{ channels: ['in_app'], recipient: 'actor' }],
    severity: 'info',
    topic: 'trends.summary',
  },
} as const satisfies Readonly<
  Partial<Record<ActivityKey, ActivityAlertPolicy>>
>;

const ACTIVITY_ALERT_POLICY_LOOKUP: Readonly<
  Partial<Record<string, ActivityAlertPolicy>>
> = ACTIVITY_ALERT_POLICIES;

/** The alert policy for an activity key, or `null` when it is history only. */
export function getActivityAlertPolicy(
  key: string | null | undefined,
): ActivityAlertPolicy | null {
  return key ? (ACTIVITY_ALERT_POLICY_LOOKUP[key] ?? null) : null;
}
