import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { describe, expect, it } from 'vitest';

describe('CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES', () => {
  it('only promotes harness winners on a daily schedule', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;

    expect(template).toBeDefined();
    expect(template).toMatchObject({
      category: 'analytics',
      id: 'content-loop-autopilot',
      schedule: '0 8 * * *',
    });

    expect(
      (template?.nodes ?? []).map((node) => node.data.config.actionId),
    ).toEqual(['workflow.run-child']);
    expect(template?.edges).toEqual([]);
  });

  it('does not repeat the analytics discovery or item sync owned by analytics-sync (#5634)', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;
    const actionIds = (template?.nodes ?? []).map(
      (node) => node.data.config.actionId,
    );

    expect(actionIds).not.toContain('analytics.generic.resolve-window');
    expect(actionIds).not.toContain('analytics.generic.discover');
    expect(actionIds).not.toContain('workflow.for-each');
  });

  it('uses stable node ids', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;

    expect((template?.nodes ?? []).map((node) => node.id)).toEqual([
      'promoteHarnessWinners',
    ]);
  });
});
