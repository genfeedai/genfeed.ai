import { AgentType } from '@genfeedai/contracts';
import { buildRoleStrategyInput } from '@pages/agents/content-team/content-team-presets';
import { describe, expect, it } from 'vitest';

describe('content-team-presets', () => {
  it('builds the expected role preset for an X writer', () => {
    const strategy = buildRoleStrategyInput({
      brandId: 'brand-1',
      persona: 'Sharp founder operator',
      reportsToLabel: 'Campaign Lead',
      rolePresetId: 'x-twitter-writer',
      sharedTopic: 'AI creator growth',
    });

    expect(strategy.agentType).toBe(AgentType.X_CONTENT);
    expect(strategy.displayRole).toBe('X/Twitter Writer');
    expect(strategy.platforms).toEqual(['twitter']);
    expect(strategy.teamGroup).toBe('Distribution');
    expect(strategy.reportsToLabel).toBe('Campaign Lead');
    expect(strategy.topics).toEqual(['AI creator growth']);
    expect(strategy.preferredWorkflowTemplateId).toBe('founder-x-post');
    expect(strategy.skillSlugs).toEqual(['content-writing']);
  });
});
