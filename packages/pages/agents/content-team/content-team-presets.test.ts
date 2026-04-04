import { AgentType } from '@genfeedai/enums';
import {
  buildBlueprintStrategyInputs,
  buildContentTeamCampaignInput,
  buildContentTeamGoalInput,
  buildRoleStrategyInput,
  CONTENT_TEAM_BLUEPRINT_PRESETS,
  CONTENT_TEAM_ROLE_PRESETS,
} from '@pages/agents/content-team/content-team-presets';
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
  });

  it('builds the blueprint strategy set with the expected number of roles', () => {
    const blueprint = CONTENT_TEAM_BLUEPRINT_PRESETS[0];
    const strategies = buildBlueprintStrategyInputs(blueprint.id, {
      brandId: 'brand-1',
      persona: 'Trusted educator',
      reportsToLabel: 'Main Orchestrator',
      sharedTopic: 'Short-form authority content',
    });

    expect(strategies).toHaveLength(blueprint.roleIds.length);
    expect(strategies.map((strategy) => strategy.displayRole)).toEqual(
      blueprint.roleIds.map(
        (roleId) =>
          CONTENT_TEAM_ROLE_PRESETS.find((preset) => preset.id === roleId)
            ?.displayRole,
      ),
    );
  });

  it('builds campaign input with the selected lead and credits', () => {
    const campaign = buildContentTeamCampaignInput({
      agentIds: ['strategy-1', 'strategy-2'],
      brief: 'Coordinate the creator launch team.',
      campaignLeadStrategyId: 'strategy-1',
      creditsAllocated: 900,
      label: 'Creator Launch Team',
      startDate: '2026-03-29T10:00:00.000Z',
    });

    expect(campaign.agents).toEqual(['strategy-1', 'strategy-2']);
    expect(campaign.campaignLeadStrategyId).toBe('strategy-1');
    expect(campaign.creditsAllocated).toBe(900);
    expect(campaign.status).toBe('draft');
  });

  it('builds an active company goal payload with a default metric', () => {
    const goal = buildContentTeamGoalInput({
      brandId: 'brand-1',
      description: 'Reach the next audience threshold.',
      label: 'April Views Goal',
      targetValue: 250000,
    });

    expect(goal.brand).toBe('brand-1');
    expect(goal.metric).toBe('views');
    expect(goal.isActive).toBe(true);
    expect(goal.targetValue).toBe(250000);
  });
});
