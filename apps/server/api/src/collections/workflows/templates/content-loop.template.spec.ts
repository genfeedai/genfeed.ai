import { CONTENT_LOOP_TEMPLATE } from '@api/collections/workflows/templates/content-loop.template';
import { describe, expect, it } from 'vitest';

describe('CONTENT_LOOP_TEMPLATE', () => {
  it('wires every analytics-feedback output to a real downstream consumer', () => {
    const feedbackEdges = CONTENT_LOOP_TEMPLATE.edges.filter(
      (edge) => edge.source === 'analytics-feedback',
    );
    const wiredHandles = new Set(
      feedbackEdges.map((edge) => edge.sourceHandle),
    );

    // #3023: topTopics/bestPlatform feed the trend trigger, topHooks/worstTopics
    // feed the prompt constructor, and bestPostingTimes feeds the publish node.
    // avgEngagementRate / weekOverWeekDirection / weekOverWeekChange /
    // releaseEvidence have no downstream consumer in this graph and stay
    // reporting-only outputs (asserted by the executor's own output contract).
    expect(wiredHandles).toEqual(
      new Set([
        'topTopics',
        'bestPlatform',
        'topHooks',
        'worstTopics',
        'bestPostingTimes',
      ]),
    );
  });

  it('wires topHooks to prompt-constructor as hook guidance', () => {
    expect(CONTENT_LOOP_TEMPLATE.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'topHooks',
          target: 'prompt-constructor',
          targetHandle: 'topHooks',
        }),
      ]),
    );
  });

  it('wires worstTopics to prompt-constructor as avoid directives', () => {
    expect(CONTENT_LOOP_TEMPLATE.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'worstTopics',
          target: 'prompt-constructor',
          targetHandle: 'avoidTopics',
        }),
      ]),
    );
  });

  it('wires bestPostingTimes to the publish node schedule input', () => {
    expect(CONTENT_LOOP_TEMPLATE.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'analytics-feedback',
          sourceHandle: 'bestPostingTimes',
          target: 'publish',
          targetHandle: 'bestPostingTimes',
        }),
      ]),
    );

    const publishNode = CONTENT_LOOP_TEMPLATE.nodes?.find(
      (node) => node.id === 'publish',
    );
    expect(publishNode?.data.config).toMatchObject({
      schedule: { type: 'optimal' },
    });
  });

  it('gives the prompt constructor a template that consumes topHooks and avoidTopics', () => {
    const promptNode = CONTENT_LOOP_TEMPLATE.nodes?.find(
      (node) => node.id === 'prompt-constructor',
    );
    const template = promptNode?.data.config.template;

    expect(typeof template).toBe('string');
    expect(template as string).toContain('{{topHooks}}');
    expect(template as string).toContain('{{avoidTopics}}');
    expect(template as string).toContain('{{topic}}');
    expect(template as string).toContain('{{brandVoice}}');
  });
});
