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

  it('includes productized routines with input, review, and task contracts', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('daily-trend-loop');
    expect(WORKFLOW_TEMPLATES).toHaveProperty('release-loop');

    expect(WORKFLOW_TEMPLATES['daily-trend-loop'].routine).toEqual(
      expect.objectContaining({
        defaultSchedule: '0 8 * * *',
        defaultScheduleEnabled: true,
        reviewGateDefaults: expect.objectContaining({
          enabled: true,
          requiredBeforePublish: true,
        }),
      }),
    );
    expect(
      WORKFLOW_TEMPLATES['daily-trend-loop'].routine?.trackingTasks,
    ).toHaveLength(3);
    expect(
      WORKFLOW_TEMPLATES['release-loop'].routine?.trackingTasks,
    ).toHaveLength(4);
  });
});
