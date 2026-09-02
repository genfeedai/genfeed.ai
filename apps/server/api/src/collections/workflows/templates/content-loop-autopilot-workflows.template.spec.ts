import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { describe, expect, it } from 'vitest';

describe('CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES', () => {
  it('chains analytics sync into the harness winner promotion sweep on a daily schedule', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;

    expect(template).toBeDefined();
    expect(template).toMatchObject({
      category: 'analytics',
      id: 'content-loop-autopilot',
      schedule: '0 8 * * *',
    });

    const nodeTypes = (template?.nodes ?? []).map((node) => node.type);
    expect(nodeTypes).toEqual([
      'genfeedAction',
      'genfeedAction',
      'genfeedAction',
      'genfeedAction',
    ]);
    expect(
      (template?.nodes ?? []).map((node) => node.data.config.actionId),
    ).toEqual([
      'analytics.generic.resolve-window',
      'analytics.generic.discover',
      'workflow.for-each',
      'workflow.run-child',
    ]);

    expect(template?.edges).toEqual([
      expect.objectContaining({
        source: 'resolveAnalyticsWindow',
        target: 'discoverAnalytics',
      }),
      expect.objectContaining({
        source: 'discoverAnalytics',
        target: 'syncEachAnalyticsItem',
      }),
      expect.objectContaining({
        source: 'syncEachAnalyticsItem',
        target: 'promoteHarnessWinners',
      }),
    ]);
  });

  it('uses stable, unique node ids matching the node types they wire together', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;
    const ids = (template?.nodes ?? []).map((node) => node.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'resolveAnalyticsWindow',
      'discoverAnalytics',
      'syncEachAnalyticsItem',
      'promoteHarnessWinners',
    ]);
  });
});
