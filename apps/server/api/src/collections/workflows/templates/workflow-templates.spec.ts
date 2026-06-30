import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { describe, expect, it } from 'vitest';

describe('WorkflowTemplates', () => {
  it('includes the X landscape avatar starter in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('avatar-ugc-x-landscape-heygen');
  });

  it('includes the real-estate workflow starters in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('virtual-staging-rescue');
    expect(WORKFLOW_TEMPLATES).toHaveProperty('floor-plan-interior-preview');
  });

  it('includes productized daily routine templates with review and tracking metadata', () => {
    const dailyTrendLoop = WORKFLOW_TEMPLATES['daily-trend-loop'];
    const releaseLoop = WORKFLOW_TEMPLATES['release-loop'];

    expect(dailyTrendLoop?.name).toBe('Daily Trend Loop');
    expect(releaseLoop?.name).toBe('Release Loop');

    for (const template of [dailyTrendLoop, releaseLoop]) {
      expect(template).toMatchObject({
        category: 'routines',
        isScheduleEnabled: true,
        routine: {
          cadence: 'daily',
          kind: 'productized-daily-routine',
          parentIssue: 224,
          reviewDefaults: {
            requireApproval: true,
            reviewState: 'pending_approval',
          },
          sourceIssue: 976,
          version: 1,
        },
        timezone: 'UTC',
      });
      expect(template?.inputVariables?.length).toBeGreaterThan(0);
      expect(template?.routine?.requiredSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.recommendedSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.trackingTasks.length).toBeGreaterThan(0);
      expect(template?.routine?.outputDestinations.length).toBeGreaterThan(0);
      expect(template?.schedule).toMatch(/\* \* \*/);
    }
  });
});
