import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@server/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { describe, expect, it } from 'vitest';

describe('CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES', () => {
  it('chains analytics sync into the harness winner promotion sweep on a daily schedule', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;

    expect(template).toBeDefined();
    expect(template).toMatchObject({
      category: 'analytics',
      id: 'content-loop-autopilot',
      schedule: '0 8 * * *',
      steps: [],
    });

    const nodeTypes = (template?.nodes ?? []).map((node) => node.type);
    expect(nodeTypes).toEqual([
      'analyticsGenericSync',
      'harnessWinnerPromotionSweep',
    ]);

    expect(template?.edges).toEqual([
      expect.objectContaining({
        source: 'analyticsGenericSync',
        target: 'harnessWinnerPromotionSweep',
      }),
    ]);
  });

  it('uses stable, unique node ids matching the node types they wire together', () => {
    const [template] = CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES;
    const ids = (template?.nodes ?? []).map((node) => node.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'analyticsGenericSync',
      'harnessWinnerPromotionSweep',
    ]);
  });
});
