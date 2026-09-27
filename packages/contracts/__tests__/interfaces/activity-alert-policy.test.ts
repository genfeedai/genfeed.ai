import { describe, expect, it } from 'vitest';
import { ActivityKey } from '../../src/enums/activity.enum';
import {
  formatActivityMessage,
  getActivityLifecycleStatus,
  getActivityMessageDescriptor,
} from '../../src/enums/activity-key.catalog';
import {
  ACTIVITY_ALERT_POLICIES,
  ALERT_CHANNELS,
  getActivityAlertPolicy,
} from '../../src/interfaces/notifications/activity-alert-policy.interface';
import { NOTIFICATION_TOPICS } from '../../src/interfaces/notifications/notification-preference.interface';

describe('activity alert policy map (#5197)', () => {
  it('raises alerts only for keys that need attention', () => {
    expect(getActivityAlertPolicy(ActivityKey.IMAGE_FAILED)).toEqual(
      expect.objectContaining({
        severity: 'warning',
        topic: 'generation.status',
      }),
    );
    expect(getActivityAlertPolicy(ActivityKey.POST_FAILED)?.topic).toBe(
      'publishing.status',
    );
    expect(
      getActivityAlertPolicy(ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED)
        ?.topic,
    ).toBe('integration.status');
    expect(getActivityAlertPolicy(ActivityKey.IMAGE_GENERATED)).toBeNull();
    expect(getActivityAlertPolicy(ActivityKey.CREDITS_REMOVE)).toBeNull();
    expect(getActivityAlertPolicy('not-a-key')).toBeNull();
    expect(getActivityAlertPolicy(undefined)).toBeNull();
  });

  it('keeps the existing workflow, agent, reply and credit alerts', () => {
    expect(
      getActivityAlertPolicy(ActivityKey.WORKFLOW_EXECUTION_FAILED),
    ).toEqual({
      recipients: [{ channels: ['in_app', 'email'], recipient: 'actor' }],
      severity: 'critical',
      topic: 'workflow.status',
    });
    expect(
      getActivityAlertPolicy(ActivityKey.AGENT_RUN_COMPLETED)?.recipients[0]
        .channels,
    ).toEqual(['in_app', 'email', 'telegram', 'discord']);
    expect(
      getActivityAlertPolicy(ActivityKey.SOCIAL_REPLIES_RECEIVED)?.topic,
    ).toBe('social.reply');
    expect(getActivityAlertPolicy(ActivityKey.CREDITS_LOW)?.recipients).toEqual(
      [
        { channels: ['in_app'], recipient: 'organization-owner' },
        { channels: ['discord'], recipient: 'operator' },
      ],
    );
  });

  it('uses only known topics and channels', () => {
    for (const policy of Object.values(ACTIVITY_ALERT_POLICIES)) {
      expect(NOTIFICATION_TOPICS).toContain(policy.topic);
      for (const route of policy.recipients) {
        expect(route.channels.length).toBeGreaterThan(0);
        for (const channel of route.channels) {
          expect(ALERT_CHANNELS).toContain(channel);
        }
      }
    }
  });

  it('gives every new alert key customer-facing copy', () => {
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.WORKFLOW_EXECUTION_COMPLETED),
      ),
    ).toBe('Workflow run completed');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.AGENT_RUN_FAILED),
      ),
    ).toBe('Agent run failed');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.AGENT_RUN_DELIVERY_FAILED),
      ),
    ).toBe("Couldn't deliver the agent run update");
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.AGENT_REVIEW_EXPIRED),
      ),
    ).toBe('Agent review expired');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.SOCIAL_REPLIES_RECEIVED),
      ),
    ).toBe('New replies to your posts');
    expect(
      formatActivityMessage(
        getActivityMessageDescriptor(ActivityKey.CREDITS_LOW),
      ),
    ).toBe('Credits are running low');
    expect(getActivityLifecycleStatus(ActivityKey.AGENT_RUN_FAILED)).toBe(
      'failed',
    );
    expect(
      getActivityLifecycleStatus(ActivityKey.WORKFLOW_EXECUTION_COMPLETED),
    ).toBe('completed');
  });
});
